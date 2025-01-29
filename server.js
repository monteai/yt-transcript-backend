const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

const TEMP_DIR = "/tmp"; // Use temporary directory for subtitles
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

app.get("/api/fetch-transcript", async (req, res) => {
    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ error: "Missing videoId" });

    const filePath = path.join(TEMP_DIR, `${videoId}.en.vtt`);

    async function runYtDlp(command) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: TEMP_DIR }, (error, stdout, stderr) => {
                if (error) return reject(stderr);
                if (fs.existsSync(filePath)) return resolve(fs.readFileSync(filePath, "utf-8"));
                reject("No subtitles found");
            });
        });
    }

    try {
        // Try manual subtitles first
        let vttContent = await runYtDlp(`yt-dlp --write-subs --sub-lang en --sub-format vtt --skip-download "https://www.youtube.com/watch?v=${videoId}"`);
        res.status(200).json({ transcript: parseVTT(vttContent) });
    } catch (manualError) {
        // If manual fails, try auto-generated subtitles
        try {
            let vttContent = await runYtDlp(`yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download "https://www.youtube.com/watch?v=${videoId}"`);
            res.status(200).json({ transcript: parseVTT(vttContent) });
        } catch (autoError) {
            res.status(404).json({ error: "No subtitles available" });
        }
    }
});

// Converts VTT file into JSON transcript
function parseVTT(vttContent) {
    const lines = vttContent.split("\n").filter(line => line.trim() !== "");
    let transcript = [];
    let currentText = "";
    let currentTime = "";

    for (let line of lines) {
        if (line.includes("-->")) {
            currentTime = line.split(" --> ")[0].trim();
        } else if (currentTime && line.trim() !== "") {
            currentText += line + " ";
        } else if (currentText) {
            transcript.push({ time: convertToSeconds(currentTime), text: currentText.trim() });
            currentText = "";
        }
    }
    return transcript;
}

function convertToSeconds(timestamp) {
    let [hours, minutes, seconds] = timestamp.split(":");
    return parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(seconds);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
