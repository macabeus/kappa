Hey, I'm glad to know that you want to go further in the AI field :fizz_yeah: 

So, about what you did: it seems nice to integrate into Kappa.
I'm (almost) finishing my work on adding agent mode to the extension, and I'll hopefully publish it in the next few days.

I was wondering if you could test it out and see if it works?
I'm very focused on releasing the first stable version for my extension. If you want, I can test it after releasing the 1.0 version for Kappa 🙏 
Also, I'm not into Wii. I'm mostly working on Gameboy Advance, so it would be harder for me to evaluate how LLM is performing.


btw if you want to go deeper and contribute on Kappa, there is an annoying limitation on my extension: I'm embedding the assembly functions using Voyage (code).
Although it returns excellent embed data, not everyone is willing to spend 5 dollars to use it. It makes the UX very bad.
It would be great if Kappa had support to run an embedded model locally.



>Local llm support? I’ll start a pr soon.
That's not exactly a local LLM support, but instead, just embedding 
we need to get the embed data from an assembly function
it's used to find the similar functions, to use later as examples on the prompt

---

## Developer Notes on Embedding Implementation

### Model Choice for Code Embeddings

- The initial implementation used `microsoft/codebert-base`, which is primarily trained on English language data.
- **BERT** is a transformer model pretrained on a large corpus of English data in a self-supervised fashion.
- For code embeddings, we need a model specifically trained for code, and ideally for assembly language. There may not be a good model specifically for assembly, but alternatives like **Qwen** or **Gemma3** are promising for code tasks.

### Integration with Database Creation

- The embedding logic should be a drop-in replacement for the `#getEmbedding` method.
- Embedding should run as part of the database creation process, ideally within the VS Code extension context.

### Pull Request Best Practices

- Keep PRs focused: avoid unrelated changes such as switching package managers, bumping unrelated dependencies, or adding unrelated files (e.g., `npm-audit.json`).
- Use `git add -p` to stage only relevant changes and create organized commits.

### Testing

- The repository uses **WebdriverIO** with the VS Code service for integration tests ([docs](https://webdriver.io/docs/wdio-vscode-service)).
- There is currently no dedicated test for embedding or database creation.
- The only related test is for the prompt builder, which indirectly uses the database: [`src/test/prompt-builder.spec.ts`](https://github.com/macabeus/kappa/blob/67ef376b3761c0ab12cfb44a91d2802e46b40cb1/src/test/prompt-builder.spec.ts).
- Creating a direct test for embedding/database creation may be tricky and is not yet implemented.
