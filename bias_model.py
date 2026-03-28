import nltk
from nltk.sentiment import SentimentIntensityAnalyzer
import spacy
import pandas as pd
from collections import Counter, defaultdict
from transformers import pipeline
import re

nltk.download('vader_lexicon')

# Load transformer sentiment model
stance_model = pipeline(
    "text-classification",
    model="cardiffnlp/twitter-roberta-base-sentiment"
)

# Load spaCy model
nlp = spacy.load("en_core_web_sm")

ignore_words = ["said", "says", "according", "reported"]
weak_threshold = 0.1  # Lower threshold to catch subtle sentiment

def analyze_bias(article):
    doc = nlp(article)
    results = []
    entity_sentiment = defaultdict(list)

    # Split sentence into clauses for better entity-level scoring
    clause_split_pattern = re.compile(r'\b(?:but|whereas|however|although|while)\b', re.IGNORECASE)

    for i, sent in enumerate(doc.sents):
        sentence_text = sent.text.strip()

        # Split sentence into clauses
        clauses = clause_split_pattern.split(sentence_text)

        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue

            # Remove reporting verbs
            text_for_sentiment = " ".join(
                [word for word in clause.split() if word.lower() not in ignore_words]
            )

            # Transformer sentiment
            result = stance_model(text_for_sentiment)[0]
            label = result['label']
            score = result['score']

            # Map label to numeric sentiment (-1 to 1)
            label_map = {"LABEL_0": -1, "LABEL_1": 0, "LABEL_2": 1}  # Negative, Neutral, Positive
            sentiment = label_map.get(label, 0) * score

            # Bias hint
            if abs(sentiment) < weak_threshold:
                bias_hint = "Neutral / weak sentiment"
            else:
                bias_hint = "Positive tone" if sentiment > 0 else "Negative tone"

            # Process entities in clause
            clause_doc = nlp(clause)
            entities = [ent.text for ent in clause_doc.ents if ent.label_ in ["ORG", "PERSON"]]

            # Assign entity-level sentiment if strong enough
            if abs(sentiment) >= weak_threshold:
                for ent in entities:
                    entity_sentiment[ent].append(sentiment)

            # Framing words
            words = [token.text.lower() for token in clause_doc if token.pos_ in ['ADJ', 'ADV']]
            freq = Counter(words)
            top_words = [w for w, _ in freq.most_common(3)]

            results.append({
                "Sentence": i + 1,
                "Text": clause,
                "Sentiment": round(sentiment, 3),
                "Entities": ", ".join(entities),
                "Framing Words": ", ".join(top_words),
                "Bias Hint": bias_hint
            })

    df = pd.DataFrame(results)

    # Entity sentiment scores
    entity_scores = {ent: sum(scores)/len(scores) for ent, scores in entity_sentiment.items()}

    # Overall bias score (0–100)
    if len(entity_scores) >= 2:
        values = list(entity_scores.values())
        bias_score = (max(values) - min(values)) * 50
    else:
        bias_score = 0

    return df, entity_scores, round(bias_score, 2)