from fastapi import FastAPI, File, UploadFile, HTTPException
from pipeline.load import get_engine, loadIntoAzure
from pipeline.transform import transform, IngestEverything
from backend.auth import create_access_token, get_password_hash, verify_password
import pandas as pd
import os
from datetime import datetime
app = FastAPI()
engine = get_engine()
pipeline_status = {}
@app.get("/records")
def get_records(limit: int = 50, offset: int = 0, status: str = "", purpose: str = ""):
    q = []
    params = ()
    if status:
        q.append(f"status = ?")
        params.append(status)
    if purpose:
        q.append(f"purpose = ?")
        params.append(purpose)
    where = "WHERE " + " AND ".join(q) if q else ""
    query = f"""
        SELECT * FROM clean_records
        {where}
        ORDER BY (SELECT NULL)
        OFFSET {offset} ROWS
        FETCH NEXT {limit} ROWS ONLY
    """
    df = pd.read_sql(query, engine, params=params)
    df = df.fillna("")
    return df.to_dict(orient="records")
@app.post("/pipeline/run")
async def run_pipeline(file: UploadFile = File(...)):
    global pipeline_status
    pipeline_status = {
        "status" : "running",
        "start" : datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    path = f"{file.filename}"
    with open(file.filename, "wb") as f:
        content = await file.read()
        f.write(content)
    if file.filename.endswith(".csv"):
        source = "csv"
    elif file.filename.endswith(".json"):
        source = "json"
    #print(f"Ścieżka pliku: {f}")
    #print(f"Źródło: {source}")
    try:  
        df = transform(path, source)
        IngestEverything(df)
        pipeline_status = {
        "status" : "completed",
        "records" : len(df),
        "start" : datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    except Exception as e:
        pipeline_status = {
        "status" : "failed",
        "errors" : str(e),
        "start" : datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    os.remove(path)
    return {"message", f"pipeline run, ingested {len(df)} records"}
@app.get("/pipeline/status")
def get_pipeline_status():
    return pipeline_status
@app.post("/register")
def register_user(email: str, password: str):
    df = pd.read_sql("SELECT * FROM users WHERE email = ?", engine, params=[(email,)])
    if len(df) > 0:
        raise HTTPException(status_code=400, detail="Email już istnieje")
    password_h = get_password_hash(password)
    dict = {'email': email, 'password_hash' : password_h}
    df = pd.DataFrame(dict,index=[0])
    loadIntoAzure('users', df)
    return {"message", "registered user"}
@app.post("/login")
def login_user(email: str, password: str):
    df = pd.read_sql("SELECT * FROM users WHERE email = ?", engine, params=[(email,)])
    if len(df) == 0:
        raise HTTPException(status_code=401, detail="Niepoprawny email lub hasło")
    correct = verify_password(password, df['password_hash'].iloc[0])
    if not correct:
        raise HTTPException(status_code=401, detail="Niepoprawny email lub hasło")
    token = create_access_token({"sub": df['email'].iloc[0], "role": df['role'].iloc[0]})
    return {"access_token": token, "token_type" : "bearer"}