from fastapi import FastAPI, File, UploadFile
from pipeline.load import get_engine
from pipeline.transform import transform, IngestEverything
import pandas as pd
import os
from datetime import datetime
app = FastAPI()
engine = get_engine()
pipeline_status = {}
@app.get("/records")
def get_records(limit: int = 50, offset: int = 0, status: str = "", purpose: str = ""):
    q = []
    if status:
        q.append(f"status = '{status}'")
    if purpose:
        q.append(f"purpose = '{purpose}'")
    where = "WHERE " + " AND ".join(q) if q else ""
    query = f"""
        SELECT * FROM clean_records
        {where}
        ORDER BY (SELECT NULL)
        OFFSET {offset} ROWS
        FETCH NEXT {limit} ROWS ONLY
    """
    df = pd.read_sql(query, engine)
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
