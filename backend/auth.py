from datetime import timedelta, datetime, timezone
from fastapi import HTTPException
from pwdlib import PasswordHash
from pipeline.load import get_engine
import jwt 
from jwt.exceptions import InvalidTokenError
import os 
from dotenv import load_dotenv


load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")
password_hash = PasswordHash.recommended()
engine = get_engine()
dummy_hash = password_hash.hash("dummypassword")
def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)
def get_password_hash(password):
    return password_hash.hash(password)
def create_access_token(data: dict):
    to_encode = data.copy()
    if ACCESS_TOKEN_EXPIRE_MINUTES:
        expire = datetime.now(timezone.utc) + timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({'exp': expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=ALGORITHM)
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token Wygasł")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Niepoprawny token")