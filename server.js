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

    console.log(`Fetching transcript for video: ${videoId}`);

    async function runYtDlp(command) {
        return new Promise((resolve, reject) => {
            console.log(`Running command: ${command}`);

            exec(command, { cwd: TEMP_DIR }, (error, stdout, stderr) => {
                console.log("yt-dlp output:", stdout);
                console.log("yt-dlp errors:", stderr);

                // List all files in TEMP_DIR to see if VTT exists
                console.log("Checking for VTT files in:", TEMP_DIR);
                const files = fs.readdirSync(TEMP_DIR);
                files.forEach(file => console.log("Found file:", file));

                // Find the first .vtt file
                const vttFile = files.find(f => f.endsWith(".vtt"));
                if (!vttFile) {
                    console.log("No VTT file found");
                    return reject("No subtitles found");
                }

                console.log("Using VTT file:", vttFile);
                resolve(fs.readFileSync(path.join(TEMP_DIR, vttFile), "utf-8"));
            });
        });
    }

    try {
        // Try manual subtitles first
        let vttContent = await runYtDlp(`yt-dlp --write-subs --sub-lang en --sub-format vtt --skip-download "https://www.youtube.com/watch?v=${videoId}"`);
        res.status(200).json({ transcript: parseVTT(vttContent) });
    } catch (manualError) {
        console.log("Manual subtitles not found, trying auto-generated subtitles...");
        try {
            let vttContent = await runYtDlp(`yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download "https://www.youtube.com/watch?v=${videoId}"`);
            res.status(200).json({ transcript: parseVTT(vttContent) });
        } catch (autoError) {
            console.log("Auto-generated subtitles also not found.");
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
