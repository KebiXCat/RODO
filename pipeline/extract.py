import pandas as pd
from datetime import datetime
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
    missing = [c for c in allColumns if c not in df.columns]
    if missing:
        if len(missing) == 1:
            raise ValueError(f"Brak kolumny '{missing[0]}' w pliku. Dodaj tę kolumnę i spróbuj ponownie.")
        raise ValueError(f"Brak kolumn w pliku: {', '.join(missing)}. Dodaj te kolumny i spróbuj ponownie.")
    df = df[allColumns]
    df["created_at"] = datetime.now().replace(microsecond=0)
    df["birth_date"] = pd.to_datetime(df["birth_date"]).dt.date
    df["source"] = source
    ingestIntoSql(df, source)
    return df
def ingestIntoSql(df, source):
    loadIntoAzure('raw_records', df)
    print("Raport z wczytania: ")
    print(f"Źródło: {source}")
    print(f"Czas Wczytania: {datetime.now().replace(microsecond=0)}")
    print(f"Kolumny: {list(df.columns)}")
    print(df.head())
if __name__ == "__main__":
    ingestIntoSql("TEST_DATA/faker.csv", "csv")

