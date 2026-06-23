from sqlalchemy import create_engine, types, text
from dotenv import load_dotenv
import os
import urllib
import pandas as pd
from datetime import datetime
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

def add_to_audit(action: str, table_name: str, changed_by: str, record_id:str =None, details:str =None):
    engine = get_engine()
    with engine.connect() as conn:
        time = datetime.now()
        query = """
            INSERT INTO audit_log (action, table_name, changed_by, record_id, details, change_time) VALUES
            (:action, :table_name, :changed_by, :record_id, :details, :time)
        """
        conn.execute(text(query), {"action": action, "table_name": table_name, "changed_by": changed_by, "record_id":record_id, "details":details, "time":time})
        conn.commit()
        