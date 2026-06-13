from fastapi import FastAPI, File, UploadFile, HTTPException
from pipeline.load import get_engine, loadIntoAzure
from pipeline.transform import transform, IngestEverything
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from backend.auth import get_current_user, get_password_hash, verify_password, create_access_token, require_role, verify_token
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
from datetime import datetime
from backend.auth import blacklisted_tokens, oauth2_scheme
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=lambda request: request.client.host)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
engine = get_engine()
pipeline_status = {}
failed_attempts = {}
MAX_ATTEMPTS = 5
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    #response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; img-src 'self' data: fastapi.tiangolo.com"
    return response
@app.get("/records")
@limiter.limit("30/minute")
def get_records(request: Request, current_user = Depends(require_role(["admin", "analityk"])), limit: int = 50, offset: int = 0, status: str = "", purpose: str = ""):
    q = []
    params = []
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
    try:
        df = pd.read_sql(query, engine, params=params)
        df = df.fillna("")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Błąd serwera")
    return df.to_dict(orient="records")
@app.post("/pipeline/run")
@limiter.limit("30/minute")
async def run_pipeline(request: Request, file: UploadFile = File(...), current_user = Depends(require_role(["admin", "user"]))):

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
    else:
        raise HTTPException(status_code=400, detail="Zły format pliku")
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
        "errors" : "Błąd przetwarzania danych",
        "start" : datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        raise HTTPException(status_code=500, detail="Błąd serwera")
    os.remove(path)
    return {"message": f"pipeline run, ingested {len(df)} records"}
@app.get("/pipeline/status")
@limiter.limit("30/minute")
def get_pipeline_status(request: Request, current_user = Depends(require_role(["admin"]))):
    if not pipeline_status:
        return {"status": "Pipeline nie był jeszcze uruchomiony"}
    return pipeline_status
@app.post("/register")
@limiter.limit("10/minute")
def register_user(request: Request, email: str, password: str):
    try:
        df = pd.read_sql("SELECT * FROM users WHERE email = ?", engine, params=[(email,)])
    except Exception as e:
        raise HTTPException(status_code=500, detail="Błąd serwera")
    if len(df) > 0:
        raise HTTPException(status_code=400, detail="Email już istnieje")
    password_h = get_password_hash(password)
    dict = {'email': email, 'password_hash' : password_h}
    df = pd.DataFrame(dict,index=[0])
    loadIntoAzure('users', df)
    return {"message": "registered user"}
@app.post("/login")
@limiter.limit("10/minute")
def login_user(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    email = form_data.username
    password = form_data.password
    try:
        df = pd.read_sql("SELECT * FROM users WHERE email = ?", engine, params=[(email,)])
    except Exception as e:
        raise HTTPException(status_code=500, detail="Błąd serwera")
    if len(df) == 0:
        raise HTTPException(status_code=401, detail="Niepoprawny email lub hasło")
    correct = verify_password(password, df['password_hash'].iloc[0])
    if not correct:
        failed_attempts[email] = failed_attempts.get(email, 0) + 1
        if failed_attempts[email] >= MAX_ATTEMPTS:
            raise HTTPException(status_code=403, detail="Konto zablokowane")
        raise HTTPException(status_code=401, detail="Niepoprawny email lub hasło")
    failed_attempts[email] = 0 
    access_token = create_access_token({"sub": df['email'].iloc[0], "role": df['role'].iloc[0]})
    refresh_token = create_access_token({"sub" : email}, exprire_time=60*24*7)
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type" : "bearer"}
@app.post("/logout")
@limiter.limit("10/minute")
def logout(request: Request, token: str = Depends(oauth2_scheme)):
    blacklisted_tokens.add(token)
    return {"message": "Wylogowano"}
@app.post("/refresh")
@limiter.limit("10/minute")
def refresh(request: Request, token: str = Depends(oauth2_scheme)):
    payload = verify_token(token)
    new_token = create_access_token({"sub": payload["sub"], "role" : payload.get("role", "user")})
    return {"access_token" : new_token, "token_type" : "bearer"}
@app.get("/my-data")
@limiter.limit("10/minute")
def get_my_data(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    email = current_user["email"]
    query = "SELECT * from clean_records WHERE email = ?"
    df = pd.read_sql(query, engine, params=[(email,)])
    df = df.fillna("")
    return df.to_dict(orient="records")