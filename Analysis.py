import nltk
from nltk.sentiment import SentimentIntensityAnalyzer
import pandas as pd
import spacy
from collections import Counter

nltk.download('vader_lexicon')

# Load models
sia = SentimentIntensityAnalyzer()
nlp = spacy.load("en_core_web_sm")

# ONE article only
article = """Apple released a new product.
Samsung criticized the launch as disappointing.
Experts say Apple’s innovation could change the market.
Critics argue Samsung’s response was weak."""

# Split into paragraphs (or sentences)
paragraphs = [p for p in article.split('\n') if p.strip() != '']

results = []

for i, para in enumerate(paragraphs):
    doc = nlp(para)

    # 1. Sentiment
    sentiment = sia.polarity_scores(para)['compound']

    # 2. Entities
    entities = [ent.text for ent in doc.ents]

    # 3. Framing words
    words = [token.text.lower() for token in doc if token.pos_ in ['ADJ', 'ADV']]
    freq = Counter(words)
    top_words = [w for w, _ in freq.most_common(3)]

    # 4. Bias hint
    if sentiment > 0.2:
        bias = "Positive tone"
    elif sentiment < -0.2:
        bias = "Negative tone"
    else:
        bias = "Neutral"

    results.append({
        "Paragraph": i + 1,
        "Text": para,
        "Sentiment": sentiment,
        "Entities": ", ".join(entities),
        "Framing Words": ", ".join(top_words),
        "Bias Hint": bias
    })

# Create table
df = pd.DataFrame(results)

# Print nicely
print(df)

# Save to file
df.to_csv("bias_report.csv", index=False)

#from transformers import pipeline

#stance_model = pipeline("text-classification", model="cardiffnlp/twitter-roberta-base-sentiment")

#result = stance_model("Policy X is innovative and promising")
#print(result)