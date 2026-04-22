import pandas as pd
def extract_csv(link):
    df = pd.read_csv(link)
    return df
def extract_json(link):
    df = pd.read_json(link)
    return df
