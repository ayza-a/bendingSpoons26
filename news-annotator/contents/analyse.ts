import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"

export const config: PlasmoCSConfig = {
  matches: ["https://*.bbc.com/*", "https://*.bbc.co.uk/*", "https://*.nytimes.com/*", "https://*.theguardian.com/*", "reuters.com/*"]
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
        highlightTextInPage(paragraph.trim(), highlightClass, data.factchecks)
      })
    }
}




function highlightTextInPage(searchText: string, className: string, factchecks: any[]) {

    // Find all <p> elements on the page
  const paragraphs = document.querySelectorAll("p")
  
  for (const p of paragraphs) {
    const pText = p.textContent?.trim() ?? ""
    
    // Check if this paragraph starts with the same text
    if (pText.slice(0, 60) === searchText.slice(0, 60)) {
      p.style.backgroundColor = className === "highlight-false" ? "rgba(255, 80, 80, 0.4)" :
                                 className === "highlight-true" ? "rgba(80, 200, 80, 0.4)" :
                                 "rgba(255, 200, 50, 0.4)"
      p.style.borderLeft = `4px solid ${className === "highlight-false" ? "red" : 
                                         className === "highlight-true" ? "green" : "orange"}`
      p.style.paddingLeft = "8px"
      p.style.cursor = "pointer"
      p.style.position = "relative"

      // Create tooltip
      const tooltip = createTooltip(factchecks)

      // Show on hover
      p.addEventListener("mouseenter", (e) => {
        const rect = p.getBoundingClientRect()
        tooltip.style.display = "block"
        tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`
        tooltip.style.left = `${rect.left + window.scrollX}px`
      })

      // Hide when mouse leaves both paragraph and tooltip
      p.addEventListener("mouseleave", (e) => {
        setTimeout(() => {
          if (!tooltip.matches(":hover")) {
            tooltip.style.display = "none"
          }
        }, 100)
      })

      tooltip.addEventListener("mouseleave", () => {
        tooltip.style.display = "none"
      })
      break
    }
  }
}

function createTooltip(factchecks: any[]) {
  const tooltip = document.createElement("div")
  tooltip.style.cssText = `
    position: absolute;
    background: #1a1a1a;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    max-width: 320px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 99999;
    pointer-events: all;
    line-height: 1.5;
    display: none;
  `

  const items = factchecks.flatMap((claim: any) => claim.claimReview).slice(0, 3)
  
  tooltip.innerHTML = items.map((review: any) => `
    <div style="margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 10px;">
      <span style="
        display: inline-block;
        background: ${review.textualRating?.toLowerCase().includes("false") ? "#ff4444" :
                     review.textualRating?.toLowerCase().includes("true") ? "#44bb44" : "#ffaa00"};
        color: white;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 6px;
      ">${review.textualRating ?? "Unrated"}</span>
      <div style="font-size: 12px; color: #aaa; margin-bottom: 4px">${review.publisher ?? ""}</div>
      <a href="${review.url}" target="_blank" style="color: #60a5fa; font-size: 12px;">
        Read full fact-check →
      </a>
    </div>
  `).join("")

  document.body.appendChild(tooltip)
  return tooltip
}