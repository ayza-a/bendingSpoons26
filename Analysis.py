from bias_model import analyze_bias

article = """Apple released a new product.
Samsung criticized the launch as disappointing.
Experts say Apple’s innovation could change the market.
Critics argue Samsung’s response was weak."""

# 🔥 Call the model
df, entity_scores, bias_score = analyze_bias(article)

# Print table
print("\nSentence-Level Analysis:\n")
print(df)

# Save CSV
df.to_csv("bias_report.csv", index=False)

# Print entity scores
print("\nEntity Sentiment Scores:")
for ent, score in entity_scores.items():
    print(f"{ent}: {round(score, 3)}")

# Print bias score
print(f"\nBias Score (0–100): {bias_score}")