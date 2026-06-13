from datetime import timedelta, datetime, timezone
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
from pipeline.load import get_engine
import jwt 
from jwt.exceptions import InvalidTokenError
import os 
from dotenv import load_dotenv

blacklisted_tokens = set()
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")
password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
engine = get_engine()
dummy_hash = password_hash.hash("dummypassword")
def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)
def get_password_hash(password):
    return password_hash.hash(password)
def create_access_token(data: dict, exprire_time: int = None):
    minutes = exprire_time or ACCESS_TOKEN_EXPIRE_MINUTES
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=int(minutes))
    to_encode.update({'exp': expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
def verify_token(token: str):
    if token in blacklisted_tokens:
        raise HTTPException(status_code=401, detail="Token Unieważniony")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=ALGORITHM)
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token Wygasł")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Niepoprawny token")
def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = verify_token(token)
    email = payload.get("sub")
    role = payload.get("role")
    if email is None:
        raise HTTPException(status_code=401, detail="Niepoprawny token")
    return {"email": email, "role": role}
def require_role(allowed_roles: list):
    def role_checker(current_user = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Brak uprawnień")
        return current_user
    return role_checker
