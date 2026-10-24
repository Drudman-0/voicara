const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const Parser = require("rss-parser");


// ==================================================
// LOAD ENVIRONMENT VARIABLES
// ==================================================

dotenv.config();


// ==================================================
// CREATE APP
// ==================================================

const app = express();

const PORT = process.env.PORT || 5000;

console.log("VOICARA DEBUG: server.js loaded");

// ==================================================
// SUPABASE CONNECTION
// ==================================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);


/* =========================================
   VOICARA SA NATIONAL NEWSROOM CONFIG
========================================= */

const rssParser = new Parser({
    timeout: 15000,
    headers: {
        "User-Agent": "VOICARA-SA-Newsroom/1.0"
    }
});

// Approved news sources
const APPROVED_NEWS_FEEDS = [
    {
        name: "SABC News",
        url: "https://www.sabcnews.com/sabcnews/feed/"
    },
    {
        name: "Department of Science, Technology and Innovation",
        url: "https://www.dsti.gov.za/rss.xml"
    },
    {
        name: "Statistics South Africa",
        url: "https://www.statssa.gov.za/?feed=rss2"
    }
];

let newsroomCache = [];
let newsroomLastUpdated = 0;
let newsroomRefreshPromise = null;

const NEWS_CACHE_DURATION = 10 * 60 * 1000;


function detectNewsCategory(text) {
    const value = String(text || "").toLowerCase();

    if (/gender-based violence|\bgbv\b|femicide|domestic violence/.test(value))
        return "gender-based-violence";
    if (/education|school|university|student|matric/.test(value))
        return "education";
    if (/health|hospital|clinic|disease|medical/.test(value))
        return "health";
    if (/sport|football|soccer|rugby|cricket|athlete/.test(value))
        return "sport";
    if (/technology|cybersecurity|artificial intelligence|\bai\b/.test(value))
        return "technology";
    if (/business|economy|economic|inflation|company|employment/.test(value))
        return "business";
    if (/court|police|crime|arrest|justice|prosecutor/.test(value))
        return "crime";
    if (/environment|climate|wildlife|pollution|conservation/.test(value))
        return "environment";
    if (/government|minister|president|parliament|election|politic/.test(value))
        return "politics";

    return "community";
}

function detectNewsProvince(text) {
    const value = String(text || "").toLowerCase();

    const provinces = [
        ["eastern-cape", /\beastern cape\b/],
        ["free-state", /\bfree state\b/],
        ["gauteng", /\bgauteng\b|\bjohannesburg\b|\bpretoria\b|\btswane\b/],
        ["kwazulu-natal", /\bkwazulu-natal\b|\bkwazulu natal\b|\bdurban\b/],
        ["limpopo", /\blimpopo\b|\bpolokwane\b/],
        ["mpumalanga", /\bmpumalanga\b|\bmbombela\b/],
        ["northern-cape", /\bnorthern cape\b/],
        ["north-west", /\bnorth west province\b|\bnorth-west province\b/],
        ["western-cape", /\bwestern cape\b|\bcape town\b/]
    ];

    for (const [province, pattern] of provinces) {
        if (pattern.test(value)) {
            return province;
        }
    }

    return "national";
}


async function refreshNewsroomCache() {
    if (newsroomRefreshPromise) {
        return newsroomRefreshPromise;
    }

    newsroomRefreshPromise = (async () => {
        const feedResults = await Promise.allSettled(
            APPROVED_NEWS_FEEDS.map(async (feed) => {
                const parsed = await rssParser.parseURL(feed.url);

                return (parsed.items || []).map((item) => {
                    const title = String(item.title || "").trim();
                    const url = String(item.link || "").trim();

                    if (!title || !/^https?:\/\//i.test(url)) {
                        return null;
                    }

                    const description = String(
                        item.contentSnippet ||
                        item.summary ||
                        item.content ||
                        ""
                    )
                        .replace(/<[^>]*>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 500);

                    const searchableText = `${title} ${description}`;
                    const imageUrl = String(item.enclosure?.url || "");

                    return {
                        id: `${feed.name}:${url}`,
                        title,
                        description:
                            description ||
                            "Read the original publisher's report.",
                        url,
                        image: /^https?:\/\//i.test(imageUrl)
                            ? imageUrl
                            : "",
                        source: feed.name,
                        publishedAt: item.isoDate || item.pubDate || null,
                        province: detectNewsProvince(searchableText),
                        category: detectNewsCategory(searchableText)
                    };
                }).filter(Boolean);
            })
        );

        const successfulFeeds = feedResults.filter(
            (result) => result.status === "fulfilled"
        );

        const articles = successfulFeeds.flatMap(
            (result) => result.value
        );

        if (successfulFeeds.length === 0) {
            throw new Error("All approved news feeds failed.");
        }

        const uniqueArticles = Array.from(
            new Map(
                articles.map((article) => [article.url, article])
            ).values()
        );

        uniqueArticles.sort((a, b) => {
            const dateA = Date.parse(a.publishedAt || "") || 0;
            const dateB = Date.parse(b.publishedAt || "") || 0;
            return dateB - dateA;
        });

        newsroomCache = uniqueArticles.slice(0, 150);
        newsroomLastUpdated = Date.now();

        console.log(
            `VOICARA SA newsroom refreshed: ${newsroomCache.length} articles; ` +
            `${successfulFeeds.length}/${APPROVED_NEWS_FEEDS.length} feeds available.`
        );

        return newsroomCache;
    })();

    try {
        return await newsroomRefreshPromise;
    } finally {
        newsroomRefreshPromise = null;
    }
}


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// ==================================================
// VIDEO UPLOAD SETTINGS
// ==================================================

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


// ==================================================
// TEST ROUTE
// ==================================================

app.get("/", (req, res) => {

    res.json({

        message: "VOICARA SA backend is running.",

        status: "online"

    });

});


// ==================================================
// SUBMIT A STORY
// ==================================================

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


            // ------------------------------------------
            // CHECK STORY
            // ------------------------------------------

            if (!story || story.trim() === "") {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide your story."

                });

            }


            // ------------------------------------------
            // UPLOAD VIDEO
            // ------------------------------------------

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

                    console.error(
                        "Video upload error:",
                        uploadError
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to upload the video."

                    });

                }


                videoPath = fileName;

            }


            // ------------------------------------------
            // SAVE STORY
            // ------------------------------------------

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
                        // until an admin publishes them

                        status:
                            "pending"

                    }

                ])
                .select();


            if (error) {

                console.error(
                    "Story database error:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to save your story."

                });

            }


            // ------------------------------------------
            // DELETE TEMP VIDEO
            // ------------------------------------------

            if (
                uploadedFilePath &&
                fs.existsSync(uploadedFilePath)
            ) {

                fs.unlinkSync(
                    uploadedFilePath
                );

            }


            // ------------------------------------------
            // SUCCESS
            // ------------------------------------------

            res.status(201).json({

                success: true,

                message:
                    "Your story has been submitted for review.",

                storyId:
                    data[0].id

            });

        }

        catch (error) {

            console.error(
                "Story submission error:",
                error
            );


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


// ==================================================
// PUBLIC STORIES
// ONLY PUBLISHED STORIES
// ==================================================

app.get(
    "/api/stories",
    async (req, res) => {

        try {

            // ------------------------------------------
            // GET PUBLISHED STORIES
            // ------------------------------------------

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

                console.error(
                    "Error fetching published stories:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to load stories."

                });

            }


            // ------------------------------------------
            // CREATE SIGNED VIDEO URLS
            // ------------------------------------------

            const stories =
                await Promise.all(

                    data.map(
                        async (story) => {

                            let videoUrl = null;


                            /*
                             * If this story has a video,
                             * create a secure temporary
                             * URL that the browser can play.
                             */

                            if (story.video_url) {

                                const {
                                    data: signedUrlData,
                                    error: signedUrlError
                                } = await supabase

                                    .storage

                                    .from("story-videos")

                                    .createSignedUrl(
                                        story.video_url,
                                        60 * 60
                                    );


                                if (signedUrlError) {

                                    console.error(
                                        "Unable to create story video URL:",
                                        signedUrlError
                                    );

                                }

                                else if (
                                    signedUrlData
                                ) {

                                    videoUrl =
                                        signedUrlData.signedUrl;

                                }

                            }


                            return {

                                ...story,

                                /*
                                 * Replace the Supabase
                                 * storage path with the
                                 * playable signed URL.
                                 */

                                video_url:
                                    videoUrl

                            };

                        }
                    )

                );


            // ------------------------------------------
            // SEND STORIES TO WEBSITE
            // ------------------------------------------

            res.json({

                success: true,

                stories:
                    stories

            });

        }

        catch (error) {

            console.error(
                "Public stories error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Something went wrong while loading stories."

            });

        }

    }
);


// ==================================================
// ADMIN: GET ALL STORIES
// ==================================================

app.get(
    "/api/admin/stories",
    async (req, res) => {

        try {

            // ------------------------------------------
            // CHECK ADMIN KEY
            // ------------------------------------------

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


            // ------------------------------------------
            // GET ALL STORIES
            // ------------------------------------------

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

                console.error(
                    "Admin stories error:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to load admin stories."

                });

            }


            // ------------------------------------------
            // COUNT STORIES
            // ------------------------------------------

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


            // ------------------------------------------
            // SEND ADMIN DATA
            // ------------------------------------------

            res.json({

                success: true,

                counts:
                    counts,

                stories:
                    data

            });

        }

        catch (error) {

            console.error(
                "Admin stories error:",
                error
            );


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

            // ------------------------------------------
            // CHECK ADMIN KEY
            // ------------------------------------------

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


            // ------------------------------------------
            // FIND STORY
            // ------------------------------------------

            const {
                data,
                error
            } = await supabase

                .from("stories")

                .select(
                    "video_url"
                )

                .eq(
                    "id",
                    id
                )

                .single();


            if (error) {

                console.error(
                    "Find story video error:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find the story."

                });

            }


            if (
                !data ||
                !data.video_url
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No video was submitted with this story."

                });

            }


            // ------------------------------------------
            // CREATE SECURE VIDEO URL
            // ------------------------------------------

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
                    "Signed video URL error:",
                    signedUrlError
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to create video access link."

                });

            }


            // ------------------------------------------
            // SEND VIDEO URL
            // ------------------------------------------

            res.json({

                success: true,

                videoUrl:
                    signedUrlData.signedUrl

            });

        }

        catch (error) {

            console.error(
                "Admin video error:",
                error
            );


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

            // ------------------------------------------
            // CHECK ADMIN KEY
            // ------------------------------------------

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


            // ------------------------------------------
            // ALLOWED STATUSES
            // ------------------------------------------

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


            // ------------------------------------------
            // UPDATE STORY
            // ------------------------------------------

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

                console.error(
                    "Update story error:",
                    error
                );


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


            // ------------------------------------------
            // SUCCESS
            // ------------------------------------------

            res.json({

                success: true,

                message:
                    `Story has been ${status}.`,

                story:
                    data[0]

            });

        }

        catch (error) {

            console.error(
                "Update story error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Something went wrong."

            });

        }

    }
);

console.log("VOICARA DEBUG: registering /api/news");

app.get("/api/news", async (req, res) => {
    try {
        const cacheIsStale =
            Date.now() - newsroomLastUpdated >= NEWS_CACHE_DURATION;

        if (cacheIsStale) {
            await refreshNewsroomCache();
        }

        res.set("Cache-Control", "public, max-age=60");

        res.json({
            success: true,
            count: newsroomCache.length,
            updatedAt: newsroomLastUpdated
                ? new Date(newsroomLastUpdated).toISOString()
                : null,
            articles: newsroomCache
        });
    } catch (error) {
        console.error("Newsroom feed error:", error.message);

        if (newsroomCache.length > 0) {
            return res.json({
                success: true,
                stale: true,
                count: newsroomCache.length,
                updatedAt: new Date(
                    newsroomLastUpdated
                ).toISOString(),
                articles: newsroomCache
            });
        }

        res.status(503).json({
            success: false,
            message: "The newsroom feeds are temporarily unavailable.",
            articles: []
        });
    }
});

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