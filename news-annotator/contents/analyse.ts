import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"

export const config: PlasmoCSConfig = {
  matches: ["https://*.bbc.com/*", "https://*.bbc.co.uk/*", "https://*.nytimes.com/*"]
}

// verifying that script is running
console.log("✅ content script running")

// clones file so Readability doesn't modify original DOM
const documentClone = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html")
const reader = new Readability(documentClone)

const article = reader.parse()

// checking if readability parsed the article
console.log("📰 article:", article?.title, article?.content?.slice(0, 200))

// produces :
// article.textContent : plain text to send to api
// article.content : article body HTML
// article.title : headline

// checking correct parsing / if null was returned
if (!article) {
  console.log("❌ Readability could not parse this page")
} else {
  console.log("📰 article:", article.title, article.content?.slice(0, 200))

  window.addEventListener("load", analyseArticle)
}

async function analyseArticle() {

//     // split input into sentences for better matching with google api
// const sentences = article.textContent
//     .split(/\n+/)
//     .map(p => p.trim())
//     .filter(p => p.length > 50)

  const parser = new DOMParser()
  const articleDoc = parser.parseFromString(article.content, "text/html")
  const paragraphs = Array.from(articleDoc.querySelectorAll("p"))
  .map(p => p.textContent?.trim() ?? "")
  .filter(p => p.length > 50)

    console.log(`📋 checking ${paragraphs.length} paragraphs`)

    // sends article text to python API
    console.log("📡 sending to API...")

    
    for (const paragraph of paragraphs) {
        const response = await fetch("http://127.0.0.1:8000/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paragraph })
      })

      console.log("📡 response status:", response.status)
      // receives response from python API (in json format)
      const data = await response.json()
      console.log("📊 data:", data)
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
        highlightTextInPage(claim.text, highlightClass)
      })
    }
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