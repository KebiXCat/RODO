import pandas as pd
from datetime import datetime
import uuid
from pipeline.load import loadIntoAzure
def extract(link, source):
    try:
        if(source == "csv"):
            df = pd.read_csv(link, encoding='utf-8')
        elif(source == "json"):
            df = pd.read_json(link, encoding='utf-8')
    except Exception as e:
        print(f"Błąd wczytania: {e}" )
        return None
    print(f"path: {link}, source: {source}")
    allColumns = ['first_name', 'last_name', 'email', 'phone', 'birth_date', 'purpose', 'consent', 'PESEL']
    df = df[allColumns]
    df["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    df["source"] = source
    df["uuid"] = [str(uuid.uuid4()) for i in range(len(df))]
    return df
def ingestIntoSql(link, source):
    df = extract(link, source)
    loadIntoAzure('raw_records', df)
    print("Raport z wczytania: ")
    print(f"Źródło: {source}")
    print(f"Czas Wczytania: {datetime.now()}")
    print(f"Kolumny: {list(df.columns)}")
    print(df.head())
if __name__ == "__main__":
    ingestIntoSql("TEST_DATA/faker.csv", "csv")

