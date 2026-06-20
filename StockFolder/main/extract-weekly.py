import pandas as pd
import yfinance as yf

from stock_registry import STOCK_UNIVERSE, weekly_csv_path


def export_weekly_history(stock):
    stock_name = stock["stock_name"]
    ticker_symbol = stock["ticker"]

    print(f"Processing {stock_name} ({ticker_symbol})...")
    ticker = yf.Ticker(ticker_symbol)

    price_df = ticker.history(period="10y", interval="1wk", auto_adjust=False).reset_index()
    div_df = ticker.dividends.reset_index()

    price_df["Date"] = pd.to_datetime(price_df["Date"]).dt.tz_localize(None)
    price_df["Date"] = price_df["Date"] + pd.Timedelta(days=4)
    price_df = price_df[["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]
    price_df["Notes"] = ""

    if not div_df.empty:
        div_df.columns = ["Date", "Dividends"]
        div_df["Date"] = pd.to_datetime(div_df["Date"]).dt.tz_localize(None)
        div_df["Notes"] = div_df["Dividends"].apply(lambda x: f"{x:.4f} Dividend")

        div_rows = pd.DataFrame(
            {
                "Date": div_df["Date"],
                "Open": "",
                "High": "",
                "Low": "",
                "Close": "",
                "Adj Close": "",
                "Volume": "",
                "Notes": div_df["Notes"],
            }
        )
        combined_df = pd.concat([price_df, div_rows], ignore_index=True)
    else:
        combined_df = price_df.copy()

    combined_df = combined_df.sort_values(by="Date", ascending=False)
    combined_df["Date"] = combined_df["Date"].dt.strftime("%d %b %Y").str.lstrip("0")

    for col in ["Open", "High", "Low", "Close", "Adj Close"]:
        combined_df[col] = combined_df[col].apply(
            lambda x: f"{float(x):.4f}" if x != "" else ""
        )

    combined_df["Volume"] = combined_df["Volume"].apply(
        lambda x: f"{int(x)}" if x != "" else ""
    )

    output_path = weekly_csv_path(stock_name)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined_df.to_csv(output_path, index=False)
    print(f"Saved: {output_path}")


def main():
    for stock in STOCK_UNIVERSE:
        export_weekly_history(stock)


if __name__ == "__main__":
    main()
