import logging
logging.disable(logging.WARNING)
import os
import warnings
warnings.filterwarnings("ignore")
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"

from bias_model import analyze_bias
from transformers import pipeline
from PIL import Image

# Load all three models for majority vote
models = {
    "umm-maybe": pipeline("image-classification", model="umm-maybe/AI-image-detector"),
    "sdxl": pipeline("image-classification", model="Organika/sdxl-detector"),
    "deepfake": pipeline("image-classification", model="prithivMLmods/Deep-Fake-Detector-Model"),
}

def check_ai_image(image_path):
    image = Image.open(image_path)
    ai_votes = 0
    real_votes = 0
    details = []

    for name, detector in models.items():
        results = detector(image)
        for r in results:
            if r['label'] in ['artificial', 'ai', 'FAKE', 'SD', 'Deepfake']:
                ai_votes += 1
                details.append(f"{name}: AI ({round(r['score']*100,1)}%)")
                break
            elif r['label'] in ['human', 'real', 'REAL', 'Real']:
                real_votes += 1
                details.append(f"{name}: Real ({round(r['score']*100,1)}%)")
                break

    # 2 out of 3 wins
    verdict = "AI Generated" if ai_votes >= 2 else "Likely Real"
    return {
        "verdict": verdict,
        "vote": f"{ai_votes} AI / {real_votes} Real",
        "details": details
    }


# Test image
result = check_ai_image("images.jpeg")
print("\nImage Analysis:")
print(f"Verdict: {result['verdict']}")
print(f"Vote:    {result['vote']}")
for d in result['details']:
    print(f"  {d}")

# Bias analysis
article = """Apple released a new product.
Samsung criticized the launch as disappointing.
Experts say Apple's innovation could change the market.
Critics argue Samsung's response was weak."""

df, entity_scores, bias_score = analyze_bias(article)

print("\nSentence-Level Analysis:\n")
print(df.to_string(index=False))

df.to_csv("bias_report.csv", index=False)

print("\nEntity Sentiment Scores:")
for ent, score in entity_scores.items():
    print(f"  {ent}: {round(score, 3)}")

print(f"\nBias Score (0-100): {bias_score}")