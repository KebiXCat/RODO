from fastapi import FastAPI, File, UploadFile, HTTPException
from pipeline.load import get_engine, loadIntoAzure, add_to_audit
from pipeline.transform import transform, IngestEverything, checkPhone, format_phone
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
from sqlalchemy import text

limiter = Limiter(key_func=lambda request: request.client.host)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "https://kebixcat.github.io"],
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
    q.append(f"processing_frozen = ?")
    params.append('0')
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
        df = pd.read_sql(query, engine, params=tuple(params))
        df = df.fillna("")
        add_to_audit("SELECT", "clean_records", current_user["email"], details="get_records")
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
        add_to_audit("INSERT", "clean_records, keys", current_user["email"], details=f"pipeline, Dodano {len(df)} rekordów")
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
    add_to_audit("register", "users", email)
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
    refresh_token = create_access_token({"sub" : email, "role": df['role'].iloc[0]}, exprire_time=60*24*7)
    add_to_audit("LOGIN", "users", email)
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type" : "bearer"}
@app.post("/logout")
@limiter.limit("10/minute")
def logout(request: Request, token: str = Depends(oauth2_scheme)):
    blacklisted_tokens.add(token)
    add_to_audit("LOGOUT", "users", get_current_user(token)["email"])
    return {"message": "Wylogowano"}
@app.post("/refresh")
@limiter.limit("10/minute")
def refresh(request: Request, token: str = Depends(oauth2_scheme)):
    payload = verify_token(token)
    new_token = create_access_token({"sub": payload["sub"], "role" : payload.get("role", "user")})
    return {"access_token" : new_token, "token_type" : "bearer"}
def fetch_my_data(email: str):
    query = """
    SELECT first_name, last_name, PESEL, birth_date, email, phone, purpose, consent, processing_frozen
    FROM clean_records c
    JOIN keys k ON c.id = k.id
    WHERE email = ?"""
    df = pd.read_sql(query, engine, params=[(email,)])
    df = df.fillna("")
    return df
@app.get("/my-data")
@limiter.limit("10/minute")
def get_my_data(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    df = fetch_my_data(email)
    add_to_audit("SELECT", "clean_records, keys", current_user["email"], details="get_my_data")
    return df.to_dict(orient="records")
@app.get("/change-data")
@limiter.limit("10/minute")
def change_my_data(request: Request, email: str, first_name: str= None, last_name: str=None, PESEL: str=None, birth_date: str = None, phone: str = None, current_user = Depends(require_role(["admin"]))):
    if first_name or last_name or PESEL or birth_date:
        updates = []
        params = {}
        if first_name:
            updates.append("first_name = :first_name")
            params["first_name"] = first_name
        if last_name:
            updates.append("last_name = :last_name")
            params["last_name"] = last_name
        if PESEL:
            updates.append("PESEL = :PESEL")
            params["PESEL"] = PESEL
        if birth_date:
            updates.append("birth_date = :birth_date")
            birth_date= pd.to_datetime(birth_date).strftime("%d-%m-%Y")
            params["birth_date"] = birth_date
        params["email"] = email
        query = f"""
        UPDATE keys SET {", ".join(updates)} 
        OUTPUT INSERTED.id
        FROM keys k
        JOIN clean_records cr ON k.id = cr.id
        WHERE cr.email = :email
        """
        with engine.connect() as conn:
            result = conn.execute(text(query), params)
            changed_ids = [row[0] for row in result.fetchall()]
            for id in changed_ids:
                add_to_audit("UPDATE", "keys", current_user["email"], id, details=f"change_my_data: {', '.join(updates)}")
            conn.commit()
    if phone:
        params = {}
        params["email"] = email
        if not checkPhone(phone):
            raise HTTPException(status_code=400, detail="Niepoprawny numer telefonu")
        phone = format_phone(phone)
        params["phone"] = phone
        query = f"""
        UPDATE clean_records SET phone = :phone
        OUTPUT INSERTED.id
        WHERE email = :email
        """
        with engine.connect() as conn:
            result = conn.execute(text(query), params)
            changed_ids = [row[0] for row in result.fetchall()]
            for id in changed_ids:
                add_to_audit("UPDATE", "keys", current_user["email"], id, details=f"change_my_data: phone")
            conn.commit()
    return {"message" : "Zaktualizowano dane"}
@app.delete("/records")
@limiter.limit("10/minute")
def delete_my_data(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    query1 = """
    DELETE FROM clean_records OUTPUT DELETED.id WHERE email = :email
    """
    query2 = """
    DELETE FROM raw_record WHERE email = :email
    """
    query3 = """
    DELETE FROM keys k
    JOIN clean_records c ON k.id = c.id
    WHERE email = :email
    """
    with engine.connect() as conn:
        result1 = conn.execute(text(query1), {"email" : email})
        ids = [row[0] for row in result1.fetchall()]
        conn.execute(text(query2),{"email" : email})
        conn.execute(text(query3), {"email" : email})
        for i in ids:
            add_to_audit("DELETE", "keys, clean_records, raw_records", current_user["email"], i, details="delete_my_data")
        conn.commit()
    return {"message" : "Usunięto dane"}
@app.get("/export_data")
@limiter.limit("10/minute")
def export_data(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    df = fetch_my_data(email)
    df_csv = df.to_csv(index=False)
    add_to_audit("SELECT", "clean_records", current_user["email"], details=f"export_data: {email}")
    return Response(
        content=df_csv,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=data.csv"
        }
    )
def add_record(df: pd.DataFrame, current_user):
    csv_plik = df.to_csv("add.csv", index=False)
    data = transform("add.csv", "csv")
    IngestEverything(data)
    os.remove("add.csv")
    purpose = df["purpose"].iloc[0]
    email = df["email"].iloc[0]
    id = pd.read_sql("SELECT TOP 1 id FROM clean_records WHERE purpose = ? AND email = ?", engine, params=[(purpose, email)])
    add_to_audit("INSERT", "clean_records, keys, raw_records", current_user["email"], id, "Dodano nową zgodę")
@app.post("/change_consent")
@limiter.limit("10/minute")
def change_consent(request: Request, email: str, purpose: str, consent: bool, current_user = Depends(require_role(["admin"]))):
    with engine.connect() as conn:
        existing = pd.read_sql("SELECT id FROM clean_records WHERE email = ? AND purpose = ?", engine, params=[(email, purpose)])
        query1 = """
            UPDATE clean_records
            SET consent = :consent
            OUTPUT INSERTED.id
            WHERE email = :email AND purpose = :purpose
        """
        if len(existing) > 0: 
            result = conn.execute(text(query1), {"email" : email, "purpose" : purpose, "consent" : consent})
            id = [row[0] for row in result.fetchall()]
            for i in id:
                add_to_audit("UPDATE", "clean_records", current_user["email"], i, "Zmieniono zgodę")
            conn.commit()
        else: 
            query = """
                SELECT TOP 1 k.first_name, k.last_name, c.email, c.phone,
                k.birth_date, c.purpose, c.consent, k.PESEL
                FROM clean_records c
                JOIN keys k ON c.id = k.id
                WHERE c.email = ?
            """
            df = pd.read_sql(query, engine, params=[(email,)])
            df['purpose'] = purpose
            df['consent'] = consent
            add_record(df, current_user)
            
    return {"message": "Zmieniono zgodę"}
@app.post("/freeze")
@limiter.limit("10/minute")
def freeze(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    with engine.connect() as conn:
        query = """
            UPDATE clean_records SET processing_frozen = 1
            WHERE email = :email
        """
        conn.execute(text(query), {"email" :  email})
        conn.commit()
    return {"message" : "Przetwarzanie zamrożone"}
@app.post("/un_freeze")
@limiter.limit("10/minute")
def un_freeze(request: Request, email: str, current_user = Depends(require_role(["admin"]))):
    with engine.connect() as conn:
        query = """
            UPDATE clean_records SET processing_frozen = 0
            WHERE email = :email
        """
        conn.execute(text(query), {"email" :  email})
        conn.commit()
    return {"message" : "Przetwarzanie odblokowane"}