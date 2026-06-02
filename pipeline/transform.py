from extract import extract
import pandas as pd
import phonenumbers
from load import loadIntoAzure
def checkTypes(df):
    if df["first_name"].dtype != 'str':
        df["first_name"] = df["first_name"].astype('str')
    if df["last_name"].dtype != 'str':
        df["last_name"] = df["last_name"].astype('str')
    if df["email"].dtype != 'str':
        df["email"] = df["email"].astype('str')
    if df["phone"].dtype != 'str':
        df["phone"] = df["phone"].astype('str')
    if df["purpose"].dtype != 'str':
        df["purpose"] = df["purpose"].astype('str')
    return df
def checkPhone(phone):
    try:
        parsed = phonenumbers.parse(phone, "PL")
        return phonenumbers.is_valid_number(parsed) & phonenumbers.is_possible_number(parsed)
    except:
        return False
    
def format_phone(x):
    try:
        if not x.startswith("+"):
            x = "+48" + x.replace(" ", "").replace("-", "")
        parsed = phonenumbers.parse(x, "PL")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
    except:
        return x
    
def normalise(df):
    df["first_name"] = df["first_name"].str.strip().str.title()

    df["last_name"] = df["last_name"].str.strip().str.title()

    df["email"] = df["email"].str.strip().str.lower()

    df["phone"] = df["phone"].str.strip()
    df["phone"] = df["phone"].apply(format_phone)
    
    df["birth_date"] = pd.to_datetime(df["birth_date"], errors='coerce')
    df["birth_date"] = df["birth_date"].dt.strftime("%d-%m-%Y")

    return df
def transform(link, source):
    df = extract(link,source)
    allColumns = {'first_name', 'last_name', 'email', 'phone', 'birth_date', 'purpose', 'consent', 'PESEL'}
    mustHaveColumns = ['email', 'phone', 'purpose', 'consent']
    possiblePurposes = {'rekrutacja', 'marketing', 'obsługa klienta'}
    ## check if columns are fine
    df = df.reset_index(drop=True)
    if allColumns.issubset(df.columns):
        print("Poprawne kolumny!")
    else:
        print("Błędne kolumny!")
    df["reason"] = ""
    df["status"] = "VALID"
    df = checkTypes(df)

    df = normalise(df)

    # mark rows with null values as INVALID
    for column in mustHaveColumns:
        df.loc[df[column].isnull(), "status"] = "INVALID"
        df.loc[df[column].isnull(), "reason"] = "NULL VALUES"


    # mark invalid emails
    regexEmail = r'((?!\.)[\w\-_.]*[^.])(@\w+)(\.\w+(\.\w+)?[^.\W])$'
    df.loc[~df["email"].str.match(regexEmail), "status"] = "INVALID"
    df.loc[~df["email"].str.match(regexEmail), "reason"] = "INVALID_EMAIL"
    ##print(df[~df["email"].str.match(regexEmail)])

    # mark invalid phones
    df.loc[~df['phone'].apply(checkPhone), "status"] = "INVALID"
    df.loc[~df['phone'].apply(checkPhone), "reason"] = "INVALID_PHONE"
    ##print(df.loc[~df["phone"].str.match(regexPhone), "phone"])

    # mark invalid purposes
    df.loc[~df["purpose"].isin(possiblePurposes), "status"] = "INVALID" 
    df.loc[~df["purpose"].isin(possiblePurposes), "reason"] = "INVALID_PURPOSE" 
    # print(df.loc[~df["purpose"].isin(possiblePurposes), "purpose"])

    # mark dupliacted data by email + phone
    df.loc[df.duplicated(subset=['email', 'phone']), "status"] = "DUPLICATE"

    pd.set_option('display.max_columns', None)
    print(df.head())

    print(df.value_counts("status"))
    print(df.value_counts("reason").drop(""))
    print(df.isnull().sum())
    #print invalid records
    #print(df.loc[df["status"] == 'INVALID'])
    return df
def getClean(df):
    clean_columns = ['uuid', 'email', 'phone', 'purpose', 'consent', 'status', 'reason', 'source', 'created_at']
    df = df[clean_columns]
    return df
def getKeys(df):
    keys_columns = ['uuid', 'first_name', 'last_name', 'PESEL', 'birth_date']
    df = df[keys_columns]
    return df
def IngestIntoSqlFull(df):
    loadIntoAzure('full_records', df)
def IngestIntoSqlClean(df):
    df = getClean(df)
    loadIntoAzure('clean_records', df)
def IngestIntoSqlKeys(df):
    df = getKeys(df)
    loadIntoAzure('keys', df)

path = "TEST_DATA/faker.csv"
source = "csv"
df = transform(path, source)
IngestIntoSqlClean(df)
IngestIntoSqlKeys(df)
IngestIntoSqlFull(df)

