const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===============================
// SUPABASE
// ===============================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
);

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// VIDEO UPLOAD SETTINGS
// ===============================

const upload = multer({
    dest: "temp/",
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "video/mp4",
            "video/webm",
            "video/quicktime"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only MP4, WebM and MOV videos are allowed."));
        }
    }
});

// ===============================
// TEST ROUTE
// ===============================

app.get("/", (req, res) => {
    res.json({
        message: "VOICARA SA backend is running.",
        status: "online"
    });
});

// ===============================
// SUBMIT STORY
// ===============================

app.post("/api/stories", upload.single("video"), async (req, res) => {

    let uploadedFilePath = null;

    try {

        const {
            name,
            province,
            story,
            anonymous
        } = req.body;

        const video = req.file;

        uploadedFilePath = video ? video.path : null;

        // Check story
        if (!story || story.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Please provide your story."
            });
        }

        let videoPath = null;

        // ===============================
        // UPLOAD VIDEO TO SUPABASE
        // ===============================

        if (video) {

            const fileExtension = path.extname(video.originalname);

            const fileName =
                `stories/${Date.now()}-${Math.random()
                    .toString(36)
                    .substring(2)}${fileExtension}`;

            const fileBuffer = fs.readFileSync(video.path);

            const { error: uploadError } =
                await supabase.storage
                    .from("story-videos")
                    .upload(fileName, fileBuffer, {
                        contentType: video.mimetype,
                        upsert: false
                    });

            if (uploadError) {
                console.error(uploadError);

                return res.status(500).json({
                    success: false,
                    message: "Unable to upload the video."
                });
            }

            videoPath = fileName;
        }

        // ===============================
        // SAVE STORY TO DATABASE
        // ===============================

        const { data, error } = await supabase
            .from("stories")
            .insert([
                {
                    name: anonymous === "true" ? null : name,
                    province: province || null,
                    story: story,
                    video_url: videoPath,
                    anonymous: anonymous === "true",
                    status: "pending"
                }
            ])
            .select();

        if (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Unable to save your story."
            });
        }

        // ===============================
        // DELETE TEMPORARY FILE
        // ===============================

        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
        }

        // ===============================
        // SUCCESS
        // ===============================

        res.status(201).json({
            success: true,
            message: "Your story has been submitted for review.",
            storyId: data[0].id
        });

    } catch (error) {

        console.error(error);

        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
        }

        res.status(500).json({
            success: false,
            message: "Something went wrong while submitting your story."
        });
    }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
    console.log(
        `VOICARA SA backend running on http://localhost:${PORT}`
    );
});