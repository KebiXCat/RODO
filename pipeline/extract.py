import pandas as pd
from datetime import datetime
import sqlite3
import uuid
def extract(link, source):
    try:
        if(source == "csv"):
            df = pd.read_csv(link)
        elif(source == "json"):
            df = pd.read_json(link)
    except Exception as e:
        print(f"Błąd wczytania: {e}" )
        return None
    allColumns = ['first_name', 'last_name', 'email', 'phone', 'birth_date', 'purpose', 'consent', 'PESEL']
    df = df[allColumns]
    df["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    df["source"] = source
    df["uuid"] = [str(uuid.uuid4()) for i in range(len(df))]
    return df
def ingestIntoSql(link, source):
    df = extract(link, source)
    connection = sqlite3.connect("raw_records.db")
    df.to_sql("raw_records", connection, if_exists="append")
    print("Raport z wczytania: ")
    print(f"Źródło: {source}")
    print(f"Czas Wczytania: {datetime.now()}")
    print(f"Kolumny: {list(df.columns)}")
    print(df.head())
if __name__ == "__main__":
    ingestIntoSql("TEST_DATA/test3.csv", "csv")

