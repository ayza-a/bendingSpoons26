from fastapi import FastAPI
from pydantic import BaseModel

APP = FastAPI()

class InputText(BaseModel):
    text: str

@APP.post("/check")
def check_fact(data: InputText):
    return {"received": data.text}