import pandas as pd
from datetime import datetime
import sqlite3
def extract(link, source):
    try:
        if(source == "csv"):
            df = pd.read_csv(link)
        elif(source == "json"):
            df = pd.read_json(link)
    except Exception as e:
        print(f"Błąd wczytania: {e}" )
        return None
    df["timeOfProccesing"] = datetime.now()
    df["source"] = source
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

ingestIntoSql("TEST_DATA/test3.csv", "csv")

