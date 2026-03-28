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

// checks if article parsed correctly
if (article) {

    // sends article text to python API
  const response = await fetch("http://127.0.0.1:8000/factcheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: article.textContent })
  })

  // receives response from python API (in json format)
  const data = await response.json()

  // data.factchecks is the array of matched claims returned by python
  data.factchecks.forEach((claim: any) => {
    // extract rating
    const rating = claim.claimReview[0]?.textualRating?.toLowerCase() ?? ""

    // the text being annotated
    const text = claim.text

    // Decide highlight colour based on rating
    let highlightClass = ""

    // using pattern matching to decide highlight category 
    if (rating.includes("false") || rating.includes("incorrect")) {
      highlightClass = "highlight-false"
    } else if (rating.includes("true") || rating.includes("correct")) {
      highlightClass = "highlight-true"
    } else {
      highlightClass = "highlight-mixed" // "misleading", "mostly true" etc.
    }

    // Find and highlight the claim text in the page
    highlightTextInPage(text, highlightClass)
  })
}


function highlightTextInPage(searchText: string, className: string) {
  const body = document.body
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  
  let node: Text | null

  // searches document body for desired text
  while ((node = walker.nextNode() as Text)) {

    // default to -1 if there is no text content
    const index = node.textContent?.indexOf(searchText) ?? -1

    // if content is text content
    if (index !== -1) {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + searchText.length)

      const mark = document.createElement("mark")
      mark.className = className
      range.surroundContents(mark)
      break
    }
  }
}