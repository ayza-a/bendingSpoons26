import nltk
import spacy
import pandas as pd
from collections import Counter, defaultdict
from transformers import pipeline
import re
import logging
logging.disable(logging.WARNING)
import os
import warnings
warnings.filterwarnings("ignore")
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"

# Load transformer sentiment model
stance_model = pipeline(
    "text-classification",
    model="cardiffnlp/twitter-roberta-base-sentiment"
)

# Load spaCy model
nlp = spacy.load("en_core_web_sm")

ignore_words = ["said", "says", "according", "reported"]
weak_threshold = 0.1


def analyze_bias(article):
    try:
        doc = nlp(article)
        clause_split_pattern = re.compile(r'\b(?:but|whereas|however|although|while)\b', re.IGNORECASE)

        # --- Pass 1: collect clauses ---
        clause_data = []
        for i, sent in enumerate(doc.sents):
            for clause in clause_split_pattern.split(sent.text.strip()):
                clause = clause.strip()
                if not clause or len(clause.split()) < 2:
                    continue
                text_for_sentiment = " ".join(
                    [w for w in clause.split() if w.lower() not in ignore_words]
                )
                clause_data.append((i + 1, clause, text_for_sentiment))

        if not clause_data:
            print("Warning: no clauses found")
            return pd.DataFrame(), {}, 0

        # --- Pass 2: batch ALL models together ---
        texts = [cd[2] for cd in clause_data]
        clauses_only = [cd[1] for cd in clause_data]

        # Batch spaCy
        active_pipes = nlp.pipe_names
        to_disable = [p for p in ["lemmatizer", "textcat"] if p in active_pipes]
        clause_docs = list(nlp.pipe(clauses_only, batch_size=32, disable=to_disable))

        # Batch sentiment
        batch_results = stance_model(texts, batch_size=16, truncation=True)
        
        # --- Pass 3: combine results ---
        results = []
        entity_sentiment = defaultdict(list)
        label_map = {"LABEL_0": -1, "LABEL_1": 0, "LABEL_2": 1}

        for i, ((sent_num, clause, _), result, clause_doc) in enumerate(
            zip(clause_data, batch_results, clause_docs)
        ):
            # Sentiment
            label = result['label']
            score = result['score']
            sentiment = label_map.get(label, 0) * score

            bias_hint = "Neutral / weak sentiment" if abs(sentiment) < weak_threshold else (
                "Positive tone" if sentiment > 0 else "Negative tone"
            )

            # Entities
            entities = [ent.text for ent in clause_doc.ents if ent.label_ in ["ORG", "PERSON"]]
            if abs(sentiment) >= weak_threshold:
                for ent in entities:
                    entity_sentiment[ent].append(sentiment)

            # Framing words
            words = [t.text.lower() for t in clause_doc if t.pos_ in ['ADJ', 'ADV']]
            top_words = [w for w, _ in Counter(words).most_common(3)]

            results.append({
                "Sentence": sent_num,
                "Text": clause,
                "Sentiment": round(sentiment, 3),
                "Entities": ", ".join(entities),
                "Framing Words": ", ".join(top_words),
                "Bias Hint": bias_hint,
            })

        df = pd.DataFrame(results)
        entity_scores = {e: sum(s)/len(s) for e, s in entity_sentiment.items()}
        bias_score = round((max(entity_scores.values()) - min(entity_scores.values())) * 50, 2) \
            if len(entity_scores) >= 2 else 0

        return df, entity_scores, bias_score

    except Exception as e:
        import traceback
        traceback.print_exc()
        return pd.DataFrame(), {}, 0