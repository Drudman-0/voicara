const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");


// ===============================
// LOAD ENVIRONMENT VARIABLES
// ===============================

dotenv.config();


// ===============================
// CREATE APP
// ===============================

const app = express();

const PORT = process.env.PORT || 5000;


// ===============================
// SUPABASE CONNECTION
// ===============================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);


// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


// ===============================
// VIDEO UPLOAD SETTINGS
// ===============================

const upload = multer({

    dest: "temp/",

    limits: {
        fileSize: 100 * 1024 * 1024
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

            cb(
                new Error(
                    "Only MP4, WebM and MOV videos are allowed."
                )
            );

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
// SUBMIT A STORY
// ===============================

app.post(
    "/api/stories",
    upload.single("video"),
    async (req, res) => {

        let uploadedFilePath = null;

        try {

            const {
                name,
                province,
                story,
                anonymous
            } = req.body;


            const video = req.file;

            uploadedFilePath =
                video ? video.path : null;


            // Check story

            if (!story || story.trim() === "") {

                return res.status(400).json({

                    success: false,

                    message: "Please provide your story."

                });

            }


            // ===============================
            // UPLOAD VIDEO
            // ===============================

            let videoPath = null;


            if (video) {

                const fileExtension =
                    path.extname(
                        video.originalname
                    );


                const fileName =
                    `stories/${Date.now()}-${Math.random()
                        .toString(36)
                        .substring(2)}${fileExtension}`;


                const fileBuffer =
                    fs.readFileSync(
                        video.path
                    );


                const {
                    error: uploadError
                } = await supabase
                    .storage
                    .from("story-videos")
                    .upload(
                        fileName,
                        fileBuffer,
                        {
                            contentType:
                                video.mimetype,

                            upsert: false
                        }
                    );


                if (uploadError) {

                    console.error(uploadError);

                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to upload the video."

                    });

                }


                videoPath = fileName;

            }


            // ===============================
            // SAVE STORY
            // ===============================

            const {
                data,
                error
            } = await supabase
                .from("stories")
                .insert([

                    {

                        name:
                            anonymous === "true"
                                ? null
                                : name,

                        province:
                            province || null,

                        story:
                            story,

                        video_url:
                            videoPath,

                        anonymous:
                            anonymous === "true",

                        // New stories stay hidden
                        // until an admin approves them

                        status:
                            "pending"

                    }

                ])
                .select();


            if (error) {

                console.error(error);

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to save your story."

                });

            }


            // ===============================
            // DELETE TEMP VIDEO
            // ===============================

            if (
                uploadedFilePath &&
                fs.existsSync(uploadedFilePath)
            ) {

                fs.unlinkSync(
                    uploadedFilePath
                );

            }


            // ===============================
            // SUCCESS
            // ===============================

            res.status(201).json({

                success: true,

                message:
                    "Your story has been submitted for review.",

                storyId:
                    data[0].id

            });

        }

        catch (error) {

            console.error(error);


            if (
                uploadedFilePath &&
                fs.existsSync(uploadedFilePath)
            ) {

                fs.unlinkSync(
                    uploadedFilePath
                );

            }


            res.status(500).json({

                success: false,

                message:
                    "Something went wrong while submitting your story."

            });

        }

    }
);


// ===============================
// PUBLIC STORIES
// ONLY PUBLISHED STORIES
// ===============================

app.get("/api/stories", async (req, res) => {

    try {

        const {
            data,
            error
        } = await supabase

            .from("stories")

            .select(
                "id, name, province, story, video_url, anonymous, created_at"
            )

            .eq(
                "status",
                "published"
            )

            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(error);

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load stories."

            });

        }


        res.json({

            success: true,

            stories: data

        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                "Something went wrong while loading stories."

        });

    }

});


// ==================================================
// ADMIN: GET ALL STORIES
// ==================================================

app.get(
    "/api/admin/stories",
    async (req, res) => {

        try {

            // Check admin key

            const adminKey =
                req.headers["x-admin-key"];


            if (
                !adminKey ||
                adminKey !== process.env.ADMIN_KEY
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized."

                });

            }


            // Get all stories

            const {
                data,
                error
            } = await supabase

                .from("stories")

                .select("*")

                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


            if (error) {

                console.error(error);

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to load admin stories."

                });

            }


            // Count stories

            const counts = {

                pending:
                    data.filter(
                        story =>
                            story.status === "pending"
                    ).length,

                published:
                    data.filter(
                        story =>
                            story.status === "published"
                    ).length,

                rejected:
                    data.filter(
                        story =>
                            story.status === "rejected"
                    ).length

            };


            res.json({

                success: true,

                counts: counts,

                stories: data

            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Something went wrong."

            });

        }

    }
);

// ==================================================
// ADMIN: VIEW STORY VIDEO
// ==================================================

app.get(
    "/api/admin/stories/:id/video",
    async (req, res) => {

        try {

            // Check admin key

            const adminKey =
                req.headers["x-admin-key"];

            if (
                !adminKey ||
                adminKey !== process.env.ADMIN_KEY
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized."

                });

            }


            const { id } = req.params;


            // Find the story

            const {
                data,
                error
            } = await supabase

                .from("stories")

                .select("video_url")

                .eq("id", id)

                .single();


            if (error) {

                console.error(error);

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find the story."

                });

            }


            if (!data || !data.video_url) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No video was submitted with this story."

                });

            }


            // Create a temporary secure URL

            const {
                data: signedUrlData,
                error: signedUrlError
            } = await supabase

                .storage

                .from("story-videos")

                .createSignedUrl(
                    data.video_url,
                    60 * 60
                );


            if (signedUrlError) {

                console.error(
                    signedUrlError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to create video access link."

                });

            }


            res.json({

                success: true,

                videoUrl:
                    signedUrlData.signedUrl

            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Something went wrong while loading the video."

            });

        }

    }
);

// ==================================================
// ADMIN: UPDATE STORY STATUS
// ==================================================

app.patch(
    "/api/admin/stories/:id",
    async (req, res) => {

        try {

            // Check admin key

            const adminKey =
                req.headers["x-admin-key"];


            if (
                !adminKey ||
                adminKey !== process.env.ADMIN_KEY
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized."

                });

            }


            const {
                id
            } = req.params;


            const {
                status
            } = req.body;


            // Allowed statuses

            const allowedStatuses = [

                "pending",

                "published",

                "rejected"

            ];


            if (
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid story status."

                });

            }


            // Update story

            const {
                data,
                error
            } = await supabase

                .from("stories")

                .update({

                    status:
                        status

                })

                .eq(
                    "id",
                    id
                )

                .select();


            if (error) {

                console.error(error);

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to update story."

                });

            }


            if (
                !data ||
                data.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Story not found."

                });

            }


            res.json({

                success: true,

                message:
                    `Story has been ${status}.`,

                story:
                    data[0]

            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Something went wrong."

            });

        }

    }
);


// ==================================================
// START SERVER
// ==================================================

app.listen(
    PORT,
    () => {

        console.log(
            `VOICARA SA backend running on http://localhost:${PORT}`
        );

    }
);