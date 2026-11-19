
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 5000;
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 20;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Gemini AI connection
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Retry Gemini when temporarily busy
async function generateWithRetry(request) {
    const delays = [2000, 4000, 8000];

    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await ai.models.generateContent(request);
        } catch (error) {
            const isTemporary =
                error.status === 503 ||
                error.status === 429;

            if (!isTemporary || attempt === 3) {
                throw error;
            }

            console.log(
                `Gemini busy. Retrying in ${delays[attempt] / 1000} seconds...`
            );

            await new Promise(resolve =>
                setTimeout(resolve, delays[attempt])
            );
        }
    }
}

// File upload configuration
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

// Backend test route
app.get("/", (req, res) => {
    res.send("QuizMind AI Backend is running!");
});

// Gemini connection test
app.get("/api/test-ai", async (req, res) => {
    try {
        const response = await generateWithRetry({
            model: GEMINI_MODEL,
            contents: "Reply with exactly: Gemini connected successfully!"
        });

        res.json({ message: response.text });
    } catch (error) {
        console.error("Gemini error:", error);

        res.status(500).json({
            error: "Gemini connection failed. Please try again later."
        });
    }
});

// Extract text from uploaded files
async function extractFileText(file) {
    const fileName = file.originalname.toLowerCase();

    if (fileName.endsWith(".pdf")) {
        const data = await pdfParse(file.buffer);
        return data.text;
    }

    if (fileName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({
            buffer: file.buffer
        });

        return result.value;
    }

    if (fileName.endsWith(".txt")) {
        return file.buffer.toString("utf-8");
    }

    throw new Error("Only PDF, DOCX and TXT files are supported.");
}

// Generate one batch of questions
async function generateQuestionBatch(
    sourceText,
    batchCount,
    difficulty,
    type,
    previousQuestions
) {
    const previousQuestionList = previousQuestions.length
        ? previousQuestions.map((q, index) =>
            `${index + 1}. ${q.question}`
          ).join("\n")
        : "None";

    const prompt = `
You are an educational quiz generator.

Use ONLY the educational content provided below.

Generate exactly ${batchCount} NEW questions.

Difficulty: ${difficulty}
Question type: ${type}

Requirements:
1. Test understanding of the source material.
2. Do not repeat any previous questions.
3. For MCQ, provide exactly four meaningful and plausible options.
4. MCQ options must not be obvious or unrelated.
5. Do not create fill-in-the-blank questions.
6. For True/False, provide only True and False as options.
7. Provide the correct answer.
8. Provide a short explanation for every answer.
9. Do not invent facts unsupported by the source.
10. Ensure every question is clear and grammatically correct.
11. Return exactly ${batchCount} questions.

PREVIOUSLY GENERATED QUESTIONS (DO NOT REPEAT):
${previousQuestionList}

SOURCE CONTENT:
${sourceText}
`;

    const response = await generateWithRetry({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: {
                type: "object",
                properties: {
                    questions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                question: {
                                    type: "string"
                                },
                                options: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                },
                                answer: {
                                    type: "string"
                                },
                                explanation: {
                                    type: "string"
                                }
                            },
                            required: [
                                "question",
                                "options",
                                "answer",
                                "explanation"
                            ]
                        }
                    }
                },
                required: ["questions"]
            }
        }
    });

    const quizData = JSON.parse(response.text);

    if (
        !quizData.questions ||
        !Array.isArray(quizData.questions) ||
        quizData.questions.length !== batchCount
    ) {
        throw new Error(
            `AI generated an incorrect number of questions. Expected ${batchCount}, received ${quizData.questions?.length || 0}.`
        );
    }

    return quizData.questions;
}

// Generate quiz using Gemini in batches
app.post("/api/generate-quiz", upload.single("file"), async (req, res) => {
    try {
        const {
            text,
            count,
            difficulty,
            type
        } = req.body;

        const questionCount = Number(count);

        // Validate question count
        if (
            !Number.isInteger(questionCount) ||
            questionCount < 1 ||
            questionCount > 100
        ) {
            return res.status(400).json({
                error: "Question count must be between 1 and 100."
            });
        }

        // Validate difficulty
        if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
            return res.status(400).json({
                error: "Invalid difficulty level."
            });
        }

        // Validate question type
        if (!["MCQ", "True/False"].includes(type)) {
            return res.status(400).json({
                error: "Invalid question type."
            });
        }

        // Get source content
        let sourceText = text || "";

        if (req.file) {
            sourceText = await extractFileText(req.file);
        }

        if (!sourceText || sourceText.trim().length < 50) {
            return res.status(400).json({
                error: "Please provide at least 50 characters of readable text."
            });
        }

        // Generate questions in batches of 20
        const allQuestions = [];

        const totalBatches = Math.ceil(
            questionCount / BATCH_SIZE
        );

        for (let batch = 0; batch < totalBatches; batch++) {
            const remainingQuestions =
                questionCount - allQuestions.length;

            const currentBatchCount = Math.min(
                BATCH_SIZE,
                remainingQuestions
            );

            console.log(
                `Generating batch ${batch + 1}/${totalBatches}: ${currentBatchCount} questions`
            );

            const batchQuestions = await generateQuestionBatch(
                sourceText,
                currentBatchCount,
                difficulty,
                type,
                allQuestions
            );

            allQuestions.push(...batchQuestions);

            console.log(
                `Generated ${allQuestions.length}/${questionCount} questions`
            );
        }

        // Return the complete quiz
        res.json({
            questions: allQuestions
        });

    } catch (error) {
        console.error("Quiz generation error:", error);

        res.status(500).json({
            error: "Unable to generate quiz. Please try again."
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(
        `QuizMind AI server running at http://localhost:${PORT}`
    );
});
