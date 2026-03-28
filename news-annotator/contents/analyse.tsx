import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"

export const config: PlasmoCSConfig = {
  matches: ["https://*.bbc.com/*", "https://*.nytimes.com/*"]
}

// clones file so Readability doesn't modify original DOM
const documentClone = document.cloneNode(true) as Document
const reader = new Readability(documentClone)
const article = reader.parse()

// produces :
// article.textContent : plain text to send to api
// article.content : article body HTML
// article.title : headline