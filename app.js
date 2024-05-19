let activeNodes = {};
// Object for selected nodes. Contains:
// key = "number of the node in order of selection",
// node = "id of the selected node",
// hash = "password after selected node"
let waitlist = [];

const svgBoxes = document.querySelectorAll(".svg-box");
const circles = document.querySelectorAll(".nodeDiv");
const mainSvg = document.getElementById("main-svg");
const inputArea = document.getElementById("text-container");
const menuArea = document.getElementById("menu");
const moreBtn = document.getElementById("drop-btn");
const logoBtns = document.querySelectorAll(".logo-btn");
const dropdown = moreBtn.querySelector(".dropdown");
const twitterArea = document.getElementById("twitter-btn");
const passwordInput = document.getElementById("password");
const worker = new Worker("hashworker.js");
const copy = document.getElementById("btn-copy");

let pageRadius;
let viewportMin;
let lineCounter = 0;
let nodeCounter = 0;
let isMouseDown = false;
let latestNode = null;
let tempLine = null;
let clicked = false;
let onElementArea = false;
let inputFocus = false;
let touchOver = false;

let startDeletion = null;
let activeNodeIndex;
let totalNodes;
let isActive;
let waitlistProcessing = false;
let copyTimeout;

let activeColor = "yellow";

window.addEventListener("resize", () => {
  redrawLines();
});

moreBtn.addEventListener("click", function () {
  if (dropdown.style.display === "block") {
    dropdown.style.display = "none";
  } else {
    dropdown.style.display = "block";
  }
});

logoBtns.forEach(function (logoBtn) {
  logoBtn.addEventListener("click", function () {
    navigator.clipboard
      .writeText("")
      .then(function () {
        console.log("Clipboard cleared.");
        window.location.reload();
      })
      .catch(function (error) {
        console.error("Could not clear clipboard: ", error);
      });
  });
});

// Main handling nodes
window.addEventListener("pointerdown", (event) => {
  isMouseDown = true;
  // Better style when over inputArea
  inputArea.style.cursor = "default";
  inputArea.children[0].style.cursor = "default";
  inputArea.children[1].style.cursor = "default";
  if (latestNode && !onElementArea && !inputFocus) {
    createOrMoveLine(event.clientX, event.clientY);
  }
  if (!onElementArea && dropdown.style.display === "block") {
    dropdown.style.display = "none";
  }
});
window.addEventListener("pointermove", (event) => {
  event.preventDefault();
  if (isMouseDown && latestNode && !onElementArea) {
    createOrMoveLine(event.clientX, event.clientY);
  }
  // Handle node selection on mobile
  let touchedElement = document.elementFromPoint(event.clientX, event.clientY);
  if (touchedElement) {
    if (touchedElement.classList.contains("nodeDiv")) {
      if (!touchOver) {
        // Only run this block once when entering a new circle
        if (isMouseDown && !onElementArea) {
          handleNodeClick(touchedElement);
        }
        touchOver = true;
      } else {
        touchOver = false; // Reset when not over a circle
      }
    }
  }
});
window.addEventListener("pointerup", () => {
  isMouseDown = false;
  onElementArea = false;
  inputArea.style.cursor = "auto";
  inputArea.children[0].style.cursor = "auto";
  inputArea.children[1].style.cursor = "pointer";

  if (tempLine) {
    removeTemporaryLine();
  }
});

// Make sure not to create a line when interacting with inputArea
inputArea.addEventListener("pointerdown", () => {
  onElementArea = true;
});
menuArea.addEventListener("pointerdown", () => {
  onElementArea = true;
});
twitterArea.addEventListener("pointerdown", () => {
  onElementArea = true;
});
passwordInput.addEventListener("focus", function () {
  inputFocus = true;
});
passwordInput.addEventListener("blur", function () {
  setTimeout(() => {
    inputFocus = false;
  }, 100);
});

document.addEventListener("keydown", function (event) {
  if (passwordInput.value == "") {
    document.getElementById("text-container").style.border =
      "solid 1px var(--light-gray)";
  }
  if (
    document.activeElement !== passwordInput &&
    event.key !== "Enter" &&
    event.key !== "Escape"
  ) {
    if (/^[a-zA-Z0-9]$/.test(event.key) && !event.ctrlKey) {
      passwordInput.focus();
      event.preventDefault();

      passwordInput.value += event.key;
    } else if (event.ctrlKey && event.key === "a") {
      passwordInput.focus();
      passwordInput.select();
      event.preventDefault();
    } else if (event.ctrlKey && event.key === "v") {
      passwordInput.focus();
    }
  } else if (event.key === "Enter" || event.key === "Escape") {
    passwordInput.blur();
  }
});

copy.addEventListener("click", function () {
  copyPassword();
});

// Main handling nodes
circles.forEach((circle) => {
  circle.addEventListener("click", function () {
    const oneRemaining = Object.keys(activeNodes).length == 2; // Because weak password counts

    // Test of last node on click
    if (oneRemaining && !clicked && !inputFocus) {
      const isLast = activeNodes["number1"].node == this.id;
      if (isLast) {
        lastNodeDeletion(this);
      } else {
        handleNodeClick(this);
      }
    } else if (!oneRemaining && !clicked && !inputFocus) {
      handleNodeClick(this);
    } else if (clicked && !inputFocus) {
      // Handle case when first node clicked
      clicked = false;
    }
  });
  circle.addEventListener("pointerover", function () {
    handleNodeHover(this);
    if (isMouseDown && !onElementArea) {
      handleNodeClick(this);
    }
  });
  circle.addEventListener("pointerout", function () {
    handleNodeOut(this);
  });
  circle.addEventListener("pointerdown", function () {
    const firstNode = Object.keys(activeNodes).length <= 1;

    // Test of last node on click
    if (!firstNode && !inputFocus) {
      const isLast = activeNodes["number1"].node == this.id;
      if (isLast) {
        // Handle case when first node clicked which activates deletion on click
        handleNodeClick(this);
      } else {
        clicked = true;
        handleNodeClick(this);
      }
    } else if (!inputFocus) {
      clicked = true;
      handleNodeClick(this);
    }
  });
});

// Main function for the selection of nodes
async function handleNodeClick(nodeClicked) {
  redrawLines(); // Reinitialize if line rendering issues occur (primarily for mobile).
  // Find if the clicked node is already in activeNodes
  isActive = Object.keys(activeNodes).find(
    (key) => activeNodes[key].node === nodeClicked.id
  );

  if (isActive && !isMouseDown) {
    activeNodeIndex = parseInt(isActive.replace("number", ""));

    // If isActive && !isMouseDown, remove all entries from activeNodes that come after it

    nodeCounter = activeNodeIndex;
    lineCounter = activeNodeIndex - 1;

    totalNodes = Object.keys(activeNodes).length - 1; // Because weak password counts

    // Delete all activeNodes entries from the next number onward
    if (activeNodeIndex != totalNodes) {
      // Except if last node
      startDeletion = activeNodeIndex;
      if (!waitlistProcessing) {
        deletionProcess();
      }
    }

    console.table(activeNodes);

    latestNode = getCircleCenter(nodeClicked);
  } else if (!isActive && !onElementArea) {
    // Memorise weak password
    if (Object.keys(activeNodes).length <= 1) {
      if (passwordInput.value == "") {
        document.getElementById("text-container").style.border =
          "solid 1px var(--red-issue)";
        await shakeAnimation();
        return;
      } else {
        activeNodes["number0"] = { node: "", result: passwordInput.value };
        document.getElementById("text-container").style.border =
          "solid 1px var(--light-gray)";
      }
    }

    // If it is not, increment the counter and add the new node
    nodeCounter++;
    let selectedNode = "number" + nodeCounter;

    activeNodes[selectedNode] = { node: nodeClicked.id, result: "" };

    if (!waitlist.includes(nodeClicked.id)) {
      addToWaitlist(nodeClicked);
      displayActive(nodeClicked);
      // Trigger the processing of the waitlist
      if (waitlist.length == 1) {
        processWaitlist();
      }
    }

    // Draw line
    if (selectedNode != "number1") {
      let previousNumber = "number" + (nodeCounter - 1);
      let previousNodeId = activeNodes[previousNumber].node;
      let previousNode = document.getElementById(previousNodeId);
      drawLineBetweenNodes(previousNode, nodeClicked);
    }
    latestNode = getCircleCenter(nodeClicked);
  }
}

async function shakeAnimation() {
  const element = document.getElementById("text-container");
  element.classList.add("shake-animation");

  element.addEventListener("animationend", () => {
    element.classList.remove("shake-animation");
  });
}

// Create and Move a line when mouseDown
function createOrMoveLine(mouseX, mouseY) {
  if (!tempLine) {
    tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tempLine.setAttribute("stroke", "#6b7280");
    tempLine.setAttribute("stroke-width", "3");
    tempLine.setAttribute("stroke-linecap", "round");
    mainSvg.appendChild(tempLine);
  }
  tempLine.setAttribute("x1", latestNode.x);
  tempLine.setAttribute("y1", latestNode.y);
  tempLine.setAttribute("x2", mouseX);
  tempLine.setAttribute("y2", mouseY);
}

function removeTemporaryLine() {
  mainSvg.removeChild(tempLine);
  tempLine = null;
}

// Delete clicked node if last
function lastNodeDeletion(node) {
  displayInactive(node.id);
  isActive = "number0";
  delete activeNodes["number1"];
  comeBackPassword();
  nodeCounter = 0;
  latestNode = null;
  console.log("activeNodes object is now empty");
}

function displayActive(node) {
  if (node.classList.contains("hover-node")) {
    node.classList.remove("hover-node");
    node.classList.add("active-node");
  } else if (node.classList.contains("inactive-node")) {
    node.classList.remove("inactive-node");
    node.classList.add("active-node");
  }
}

function displayProcessed(nodeId) {
  const nodeToProcess = document.getElementById(nodeId);

  if (nodeToProcess.classList.contains("active-node")) {
    nodeToProcess.classList.remove("active-node");
    nodeToProcess.classList.add(activeColor + "-node");
  }
}

function displayInactive(nodeId) {
  const nodeToInactive = document.getElementById(nodeId);

  if (nodeToInactive.classList.contains("active-node")) {
    nodeToInactive.classList.remove("active-node");
    nodeToInactive.classList.add("inactive-node");
  } else if (nodeToInactive.classList.contains("yellow-node")) {
    nodeToInactive.classList.remove("yellow-node");
    nodeToInactive.classList.add("inactive-node");
  } else if (nodeToInactive.classList.contains("green-node")) {
    nodeToInactive.classList.remove("green-node");
    nodeToInactive.classList.add("inactive-node");
  }
}

// Displays hovered nodes
function handleNodeHover(node) {
  if (
    !node.classList.contains("active-node") &&
    node.classList.contains("inactive-node")
  ) {
    node.classList.remove("inactive-node");
    node.classList.add("hover-node");
  }
}

function handleNodeOut(node) {
  if (node.classList.contains("hover-node")) {
    node.classList.remove("hover-node");
    node.classList.add("inactive-node");
  }
}

// Draw a line between active nodes
function getCircleCenter(circle) {
  const rect = circle.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function drawLineBetweenNodes(startNode, endNode) {
  const startPos = getCircleCenter(startNode);
  const endPos = getCircleCenter(endNode);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineCounter++;
  line.setAttribute("id", "line" + lineCounter);
  line.setAttribute("x1", startPos.x);
  line.setAttribute("y1", startPos.y);
  line.setAttribute("x2", endPos.x);
  line.setAttribute("y2", endPos.y);
  line.setAttribute("stroke", "var(--medium-gray)");
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  mainSvg.appendChild(line);
}

function deleteLineById(lineId) {
  const line = document.getElementById(lineId);
  if (line) {
    mainSvg.removeChild(line);
  } else {
    console.error("Line with ID: " + lineId + " does not exist");
  }
}

function redrawLines() {
  const keys = Object.keys(activeNodes);
  for (let index = 1; index < keys.length - 1; index++) {
    let line = document.getElementById("line" + index);
    const startNode = document.getElementById(
      activeNodes["number" + index].node
    );
    const endNode = document.getElementById(
      activeNodes["number" + (index + 1)].node
    );
    const startPos = getCircleCenter(startNode);
    const endPos = getCircleCenter(endNode);

    line.setAttribute("x1", startPos.x);
    line.setAttribute("y1", startPos.y);
    line.setAttribute("x2", endPos.x);
    line.setAttribute("y2", endPos.y);
  }
}

// Waitlist for the hash functions
function addToWaitlist(node) {
  waitlist.push(node.id);
}

function deletionProcess() {
  comeBackPassword();
  for (let i = startDeletion + 1; i <= totalNodes; i++) {
    console.log(`Delete ${i}`);
    displayInactive(activeNodes["number" + i].node);
    delete activeNodes["number" + i];
    deleteLineById("line" + (i - 1));
  }
  startDeletion = null;
}

function comeBackPassword() {
  console.warn("Coming back to " + isActive);
  passwordInput.value = activeNodes[isActive].result;
  const keyIndex = parseInt(isActive.replace("number", ""));
  if (keyIndex <= 7) {
    activeColor = "yellow";
    document.body.style.backgroundColor = "white";
    // Recolor
    for (let index = 1; index < keyIndex; index++) {
      let line = document.getElementById("line" + index);
      line.setAttribute("stroke", "var(--active-" + activeColor + ")");
    }
    document.querySelectorAll(".green-node").forEach((node) => {
      node.classList.replace("green-node", "yellow-node");
    });
    document.getElementById("text-container").style.border =
      "solid 1px var(--light-gray)";
  }
}

// Hashing password

async function processWaitlist() {
  waitlistProcessing = true;
  while (waitlist.length > 0) {
    const nodeId = waitlist[0];

    let keyNode = Object.keys(activeNodes).find(
      (key) => activeNodes[key].node === nodeId
    );
    const newPassword = await changePassword(nodeId);

    activeNodes[keyNode] = { node: nodeId, result: newPassword };
    passwordInput.value = newPassword;

    displayProcessed(nodeId);
    // Display processed line
    const keyIndex = parseInt(keyNode.replace("number", ""));
    if (keyIndex == 8) {
      activeColor = "green";
      document.body.style.backgroundColor =
        "var(--background-" + activeColor + ")";
      // Recolor
      for (let index = 1; index < keyIndex; index++) {
        let line = document.getElementById("line" + index);
        line.setAttribute("stroke", "var(--active-" + activeColor + ")");
      }
      document.querySelectorAll(".yellow-node").forEach((node) => {
        node.classList.replace("yellow-node", "green-node");
      });
      document.getElementById("text-container").style.border =
        "solid 1px var(--active-" + activeColor + ")";
    }
    if (keyIndex > 1) {
      const line = document.getElementById("line" + (keyIndex - 1));
      line.setAttribute("stroke", "var(--active-" + activeColor + ")");
    }

    console.warn(`Processed ${keyNode}: New password set to ${newPassword}`);
    waitlist.shift();
  }

  // Out of the loop because of issues but then has to wait for the completion of the waitlist
  if (startDeletion) {
    deletionProcess();
  }

  copyPassword();
  waitlistProcessing = false;
  console.table(activeNodes);
}

function changePassword(saltString) {
  const start = performance.now(); // To measure time spent computing
  const currentPassword = passwordInput.value;

  return new Promise((resolve, reject) => {
    worker.postMessage({ password: currentPassword, saltString: saltString });

    worker.onmessage = function (e) {
      if (e.data.error) {
        console.error(e.data.error);
        reject(new Error(e.data.error));
      } else {
        const end = performance.now();
        const duration = end - start;
        console.log(`Hashing took ${duration.toFixed(2)} milliseconds.`);
        resolve(e.data.newPassword);
      }
    };

    worker.onerror = function (err) {
      reject(new Error("Worker error: " + err.message));
    };
  });
}

async function copyPassword() {
  passwordInput.select();
  passwordInput.setSelectionRange(0, 99999);

  const copyImg = document.getElementById("copy-img");
  const successSvg = document.getElementById("success-svg");

  await triggerAnimation();
  copyImg.style.display = "none";
  successSvg.style.display = "inline";

  navigator.clipboard.writeText(passwordInput.value);

  clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    copyImg.style.display = "block";
    successSvg.style.display = "none";
  }, 1500);

  window.getSelection().removeAllRanges();
  passwordInput.blur();
}

async function triggerAnimation() {
  const btnCopy = document.getElementById("btn-copy");
  btnCopy.classList.add("animate");

  btnCopy.addEventListener("animationend", () => {
    btnCopy.classList.remove("animate");
  });
}
