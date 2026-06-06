from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import urllib
import pandas as pd
def get_engine():
    load_dotenv()
    params = urllib.parse.quote_plus(f"Driver={{ODBC Driver 18 for SQL Server}};"
    f"Server=tcp:{os.getenv('AZURE_SERVER')},1433;"
    f"Database={os.getenv('AZURE_DATABASE')};"
    f"Uid={os.getenv('AZURE_USERNAME')};"
    f"Pwd={os.getenv('AZURE_PASSWORD')};"
    f"Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30;")

    engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}")
    return engine
def loadIntoAzure(name, df):
    engine = get_engine()
    df.to_sql(name, engine, if_exists='append', index=False)