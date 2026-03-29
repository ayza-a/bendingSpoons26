import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"

export const config: PlasmoCSConfig = {
  // the news outlets the code can currently recognise
  matches: ["https://*.bbc.com/*", "https://*.bbc.co.uk/*", "https://*.nytimes.com/*", "https://*.theguardian.com/*"]
}

// verifying that script is running
console.log("content script running")

// clones file so Readability doesn't modify original DOM
const documentClone = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html")
const reader = new Readability(documentClone)
const article = reader.parse()

// produces :
// article.textContent : plain text to send to api
// article.content : article body HTML
// article.title : headline

// checking correct parsing / if null was returned
if (!article) {
  console.log("Readability unable to parse this page")
} else {
  console.log("Article parsed successfully: ", article.title)

  // only call analyseArticle after the entire page has loaded
  window.addEventListener("load", analyseArticle)
}

// asynchronous code prevents freezing: code does not only run in order called, but as processes finish
async function analyseArticle() {

  // create parser and parse file
  const parser = new DOMParser()
  const articleDoc = parser.parseFromString(article.content, "text/html")
  const paragraphs = Array.from(articleDoc.querySelectorAll("p")) // split article contents by the 'p' tag
  .map(p => p.textContent?.trim() ?? "") // if any sections return null, store as empty string
  .filter(p => p.length > 50) // ignore paragraphs under 50 chars

  // first analyse whole text using bias API
  // outputs results to side panel onscreen
  analyseBias(article)

  // then analyse the paragraphs array using the google api
  checkFacts(paragraphs)
    
}
// contacts bias API and outputs results to webpage
async function analyseBias(article) {

  try {
    const biasResponse = await fetch("http://127.0.0.1:8001/analyze-bias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: article.textContent })
      
    })
    // receieves response from bias checker
    const biasData = await biasResponse.json()
    console.log("Bias analysed successfully")

    // display a panel showing the bias data for this text
    showBiasPanel(biasData)

  } catch (err) {
    console.log("Bias API Error", err)
  }

}

async function checkFacts(paragraphs) {

try {

    // send to fact checker
    for (const paragraph of paragraphs) {
      // send each paragraph extracted to the API
        const response = await fetch("http://127.0.0.1:8000/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paragraph })
      })

      // receives output from Google API
      const data = await response.json()

      // data.factchecks is the array of matched claims returned by python
      // classify each claim returned for this paragraph
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

    console.log("Facts Checked Successfully")

  } catch (err) {
    console.log("Google Fact Check API Error")
  }

}

function highlightTextInPage(searchText: string, className: string, factchecks: any[]) {

  // Find all <p> elements on the page
  const paragraphs = document.querySelectorAll("p")
  
  // loop through all paragraphs
  for (const p of paragraphs) {
    const pText = p.textContent?.trim() ?? ""
    
    // Check if this paragraph starts with the same text
    if (pText.slice(0, 60) === searchText.slice(0, 60)) {
      // highlight red for false category
      p.style.backgroundColor = className === "highlight-false" ? "rgba(255, 80, 80, 0.4)" :
                                // highlight green for true category
                                className === "highlight-true" ? "rgba(80, 200, 80, 0.4)" :
                                // otherwise highlight yellow for mix
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

function showBiasPanel(biasData: any) {
  // Remove existing panel if present
  document.getElementById("bias-panel")?.remove()

  const panel = document.createElement("div")
  panel.id = "bias-panel"
  panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    background: #1a1a1a;
    color: #fff;
    z-index: 999999;
    overflow-y: auto;
    padding: 20px;
    font-family: sans-serif;
    box-shadow: -4px 0 20px rgba(0,0,0,0.4);
    font-size: 13px;
  `

  // Overall bias score
  const scoreColor = biasData.bias_score > 30 ? "#ff4444" :
                     biasData.bias_score > 15 ? "#ffaa00" : "#44bb44"

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
      <h2 style="margin:0; font-size:16px">🧠 Bias Analysis</h2>
      <button id="close-bias-panel" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer">✕</button>
    </div>

    <div style="background:#2a2a2a; border-radius:8px; padding:12px; margin-bottom:16px; text-align:center">
      <div style="font-size:12px; color:#aaa; margin-bottom:4px">Overall Bias Score</div>
      <div style="font-size:32px; font-weight:bold; color:${scoreColor}">${biasData.bias_score}</div>
      <div style="font-size:11px; color:#aaa">higher = more biased</div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:12px; color:#aaa; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px">Entity Sentiment</div>
      ${Object.entries(biasData.entity_scores).map(([entity, score]: [string, any]) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; background:#2a2a2a; padding:8px; border-radius:6px">
          <span>${entity}</span>
          <span style="color:${score > 0 ? "#44bb44" : score < 0 ? "#ff4444" : "#aaa"}; font-weight:bold">
            ${score > 0 ? "+" : ""}${score.toFixed(2)}
          </span>
        </div>
      `).join("")}
    </div>

    <div>
      <div style="font-size:12px; color:#aaa; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px">Clause Breakdown</div>
      ${biasData.results.filter((r: any) => r["Bias Hint"] !== "Neutral / weak sentiment").map((r: any) => `
        <div style="background:#2a2a2a; border-radius:6px; padding:10px; margin-bottom:8px; border-left:3px solid ${r.Sentiment > 0 ? "#44bb44" : "#ff4444"}">
          <div style="color:#ddd; margin-bottom:4px">"${r.Text.slice(0, 80)}${r.Text.length > 80 ? "..." : ""}"</div>
          <div style="color:#aaa; font-size:11px">${r["Bias Hint"]} · ${r.Entities || "no entities"}</div>
          ${r["Framing Words"] ? `<div style="color:#888; font-size:11px">framing: ${r["Framing Words"]}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `

  document.body.appendChild(panel)

  document.getElementById("close-bias-panel")?.addEventListener("click", () => {
    panel.remove()
  })
}