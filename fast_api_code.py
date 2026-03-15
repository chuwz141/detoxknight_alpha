from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import uvicorn

# ===== Load model =====
MODEL_NAME = "vijjj1/cmt_doc_hai"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)

# ===== Khởi tạo FastAPI =====
app = FastAPI(title="Toxic Comment API", version="1.0")

# ===== Cho phép CORS để extension/app gọi được =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Bạn có thể giới hạn domain sau
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== API chính =====
@app.post("/predict")
async def predict(req: Request):
    data = await req.json()
    text = data.get("comment", "").strip()

    if not text:
        return {"error": "Thiếu nội dung bình luận."}

    # Tokenize
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)

    # Predict
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=1).tolist()[0]

    label = "Toxic" if probs[1] > probs[0] else "Non-toxic"
    return {"label": label, "prob": float(max(probs))}


# ===== Run local =====
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)