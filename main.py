from fastapi import FastAPI
from pydantic import BaseModel
import requests
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
# Load API key
load_dotenv()
API_KEY = os.getenv("GOOGLE_FACT_CLAIM_KEY")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or your extension origin
    allow_methods=["*"],
    allow_headers=["*"]
)
class Claim(BaseModel):
    text: str

def factcheck_google(query):
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {
        "query": query,
        "key": API_KEY,
        "pageSize": 5  # number of results
    }
    response = requests.get(url, params=params)
    data = response.json()
    
    # Extract relevant info
    results = []
    for item in data.get("claims", []):
        results.append({
            "text": item.get("text"),
            "claimReview": [
                {
                    "publisher": review.get("publisher", {}).get("name"),
                    "url": review.get("url"),
                    "title": review.get("title"),
                    "reviewDate": review.get("reviewDate"),
                    "textualRating": review.get("textualRating")
                }
                for review in item.get("claimReview", [])
            ]
        })
    return results

@app.post("/factcheck")
def check_claim(claim: Claim):
    results = factcheck_google(claim.text)
    return {"claim": claim.text, "factchecks": results}