import sys
import json
import os
from transformers import AutoTokenizer, AutoModel
import torch

def get_embedding(text, model, tokenizer):
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
    return outputs.last_hidden_state[0][0].numpy().tolist()

def main():
    if len(sys.argv) != 2:
        print("Usage: python embed_asm.py <assembly_file>")
        sys.exit(1)
    asm_file = sys.argv[1]
    with open(asm_file, "r") as f:
        code = f.read()
    tokenizer = AutoTokenizer.from_pretrained("microsoft/codebert-base")
    model = AutoModel.from_pretrained("microsoft/codebert-base")
    embedding = get_embedding(code, model, tokenizer)

    # Save embedding to embeddings/<file_name>_embedding.json
    output_dir = "embeddings"
    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(asm_file))[0]
    output_path = os.path.join(output_dir, f"{base_name}_embedding.json")
    with open(output_path, "w") as out_f:
        json.dump(embedding, out_f)
    print(f"Embedding saved to {output_path}")

if __name__ == "__main__":
    main()