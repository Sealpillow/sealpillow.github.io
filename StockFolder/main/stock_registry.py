from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# Single source of truth for the stock universe used by:
# - extract-weekly.py
# - analyze-batch.py
#
# Add a normal stock like:
# {"stock_name": "Example_Stock", "ticker": "ABCD.SI"}
#
# Keep the market index here too, but mark it as:
# {"stock_name": "STI_Index", "ticker": "^STI", "is_index": True, "run_analysis": False}
#
# Rules:
# - stock_name should match the CSV filename prefix
# - ticker should match the Yahoo Finance symbol
# - run_analysis defaults to True if omitted


STOCK_UNIVERSE = [
    {
        "stock_name": "Kimly",
        "ticker": "1D0.SI"
    },
    {
        "stock_name": "STI_ETF_SPDR",
        "ticker": "ES3.SI"
    },
    {
        "stock_name": "AIMS_APAC_REIT",
        "ticker": "O5RU.SI"
    },
    {
        "stock_name": "Mapletree_Logistics",
        "ticker": "M44U.SI"
    },
    {
        "stock_name": "CapitaLand_Ascendas",
        "ticker": "A17U.SI"
    },
    {
        "stock_name": "Sheng_Siong",
        "ticker": "OV8.SI"
    },
    {
        "stock_name": "SBS_Transit",
        "ticker": "S61.SI"
    },
    {
        "stock_name": "Bumitama_Agri",
        "ticker": "P8Z.SI"
    },
    {
        "stock_name": "ComfortDelGro",
        "ticker": "C52.SI"
    },
    {
        "stock_name": "Hyphens_Pharma",
        "ticker": "1J5.SI"
    },
    {
        "stock_name": "UOB",
        "ticker": "U11.SI"
    },
    {
        "stock_name": "Frasers_Logistics",
        "ticker": "BUOU.SI"
    },
    {
        "stock_name": "NetLink",
        "ticker": "CJLU.SI"
    },
    {
        "stock_name": "Medinex",
        "ticker": "OTX.SI"
    },
    {
        "stock_name": "Wong_Fong_Ind",
        "ticker": "1A1.SI"
    },
    {
        "stock_name": "APAC Realty",
        "ticker": "CLN.SI"
    },
    {
        "stock_name": "Choo_Chiang",
        "ticker": "42E.SI"
    },
    {
        "stock_name": "Bank_of_China_Ltd",
        "ticker": "HBND.SI"
    },
    {
        "stock_name": "Keppel_Infra_Trust",
        "ticker": "A7RU.SI"
    },
    {
        "stock_name": "STI_Index",
        "ticker": "^STI",
        "is_index": True,
        "run_analysis": False
    },
    {
        "stock_name": "Singapore_Telecommunications",
        "ticker": "Z74.SI"
    },
    {
        "stock_name": "Riverstone_Holdings",
        "ticker": "AP4.SI"
    }
]


def get_index_target():
    for stock in STOCK_UNIVERSE:
        if stock.get("is_index"):
            return stock
    raise ValueError("No index target defined in STOCK_UNIVERSE")


def get_analysis_targets():
    return [
        stock for stock in STOCK_UNIVERSE
        if not stock.get("is_index") and stock.get("run_analysis", True)
    ]


def weekly_csv_path(stock_name):
    return DATA_DIR / f"{stock_name}_weekly_historical_price.csv"


def daily_csv_path(stock_name):
    return DATA_DIR / f"{stock_name}_daily_historical_price.csv"
