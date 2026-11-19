
let quizQuestions = [];
let currentQuestion = 0;
let userAnswers = [];
let score = 0;

// Backend API URL
const API_URL = "http://localhost:5000/api/generate-quiz";

// SWITCH TO HOME SECTION
function showHome() {
    document.getElementById("homeSection").style.display = "block";
    document.getElementById("quizSection").style.display = "none";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// SWITCH TO QUIZ SECTION
function showQuiz() {
    document.getElementById("homeSection").style.display = "none";
    document.getElementById("quizSection").style.display = "block";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// GENERATE QUIZ USING GEMINI
async function generateQuiz() {

    const text = document.getElementById("contentInput").value.trim();

    const countInput = document.getElementById("questionCount").value;
    const count = Number(countInput);

    const selectedType = document.getElementById("questionType").value;
    const difficulty = document.getElementById("difficulty").value;

    const fileInput = document.getElementById("fileInput");
    const file = fileInput ? fileInput.files[0] : null;

    const errorMessage = document.getElementById("errorMessage");

    errorMessage.style.display = "none";
    errorMessage.textContent = "";

    // Validate question count
    if (
        countInput.trim() === "" ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 100
    ) {
        alert("Please enter a whole number between 1 and 100.");
        return;
    }

    // Validate text or file
    if (!text && !file) {
        alert("Please paste your notes or upload a file.");
        return;
    }

    if (text && text.length < 50 && !file) {
        alert("Please enter at least 50 characters of notes.");
        return;
    }

    // Convert question type to backend format
    const type = selectedType.toLowerCase().includes("true")
        ? "True/False"
        : "MCQ";

    // Prepare data for backend
    const formData = new FormData();

    formData.append("text", text);
    formData.append("count", count);
    formData.append("difficulty", difficulty);
    formData.append("type", type);

    if (file) {

        const allowedExtensions = [".pdf", ".docx", ".txt"];
        const fileName = file.name.toLowerCase();

        if (!allowedExtensions.some(ext => fileName.endsWith(ext))) {
            alert("Please upload a PDF, DOCX or TXT file.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert("File size must be less than 10 MB.");
            return;
        }

        formData.append("file", file);
    }

    // Show loading message
    const generateButton = document.getElementById("generateButton");
    const originalButtonText = generateButton.textContent;

    generateButton.disabled = true;
    generateButton.textContent = "Generating Quiz...";

    const loadingMessage = document.getElementById("loadingMessage");
    loadingMessage.style.display = "block";

    try {

        const response = await fetch(API_URL, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to generate quiz."
            );
        }

        if (
            !data.questions ||
            !Array.isArray(data.questions) ||
            data.questions.length !== count
        ) {
            throw new Error("Invalid quiz response received from AI.");
        }

        // Store generated questions
        quizQuestions = data.questions.map(question => ({
            question: question.question,
            options: question.options,
            answer: question.answer,
            explanation: question.explanation || ""
        }));

        // Validate question data
        for (const question of quizQuestions) {

            if (
                !question.question ||
                !Array.isArray(question.options) ||
                !question.answer ||
                !question.options.includes(question.answer)
            ) {
                throw new Error(
                    "AI returned an invalid question. Please try again."
                );
            }
        }

        // Reset quiz variables
        currentQuestion = 0;
        userAnswers = new Array(quizQuestions.length).fill(null);
        score = 0;

        // Reset quiz display
        document.getElementById("quizHeader").style.display = "flex";
        document.getElementById("progressContainer").style.display = "block";
        document.getElementById("quizCard").style.display = "block";
        document.getElementById("resultCard").style.display = "none";

        // Update question count
        document.getElementById("questionCountDisplay").textContent =
            `Question 1 of ${quizQuestions.length}`;

        // Render first question
        renderQuestion();

        // Switch to quiz screen in the same tab
        showQuiz();

    } catch (error) {

        console.error("Quiz generation error:", error);

        errorMessage.textContent =
            error.message || "Unable to generate quiz. Please try again.";

        errorMessage.style.display = "block";

    } finally {

        loadingMessage.style.display = "none";

        generateButton.disabled = false;
        generateButton.textContent = originalButtonText;
    }
}


// DISPLAY QUESTION
function renderQuestion() {

    const question = quizQuestions[currentQuestion];

    document.getElementById("questionNumber").textContent =
        `Question ${currentQuestion + 1} of ${quizQuestions.length}`;

    document.getElementById("questionCountDisplay").textContent =
        `Question ${currentQuestion + 1} of ${quizQuestions.length}`;

    document.getElementById("questionText").textContent =
        question.question;

    const optionsContainer =
        document.getElementById("optionsContainer");

    optionsContainer.innerHTML = "";

    question.options.forEach(option => {

        const button = document.createElement("button");

        button.type = "button";
        button.className = "option";
        button.textContent = option;

        button.setAttribute(
            "aria-pressed",
            userAnswers[currentQuestion] === option ? "true" : "false"
        );

        if (userAnswers[currentQuestion] === option) {
            button.classList.add("selected");
        }

        button.addEventListener("click", () => {

            userAnswers[currentQuestion] = option;

            renderQuestion();
        });

        optionsContainer.appendChild(button);
    });

    // Update progress bar
    document.getElementById("progressBar").style.width =
        `${((currentQuestion + 1) / quizQuestions.length) * 100}%`;

    // Previous button
    document.getElementById("previousButton").disabled =
        currentQuestion === 0;

    // Next button
    document.getElementById("nextButton").textContent =
        currentQuestion === quizQuestions.length - 1
            ? "Finish Quiz"
            : "Next →";
}


// NEXT QUESTION
function nextQuestion() {

    if (userAnswers[currentQuestion] === null) {
        alert("Please select an answer before continuing.");
        return;
    }

    if (currentQuestion < quizQuestions.length - 1) {

        currentQuestion++;
        renderQuestion();

    } else {

        showResults();
    }
}


// PREVIOUS QUESTION
function previousQuestion() {

    if (currentQuestion > 0) {

        currentQuestion--;
        renderQuestion();
    }
}


// SHOW RESULTS
function showResults() {

    score = quizQuestions.reduce(
        (total, question, index) =>
            total + (userAnswers[index] === question.answer ? 1 : 0),
        0
    );

    const total = quizQuestions.length;
    const wrong = total - score;
    const percentage = Math.round((score / total) * 100);

    document.getElementById("quizCard").style.display = "none";
    document.getElementById("progressContainer").style.display = "none";
    document.getElementById("quizHeader").style.display = "none";
    document.getElementById("resultCard").style.display = "block";

    document.getElementById("finalScore").textContent =
        `${percentage}%`;

    document.getElementById("correctAnswers").textContent = score;
    document.getElementById("wrongAnswers").textContent = wrong;
    document.getElementById("totalQuestions").textContent = total;

    document.getElementById("resultMessage").textContent =
        `You answered ${score} out of ${total} questions correctly.`;

    // ANSWER REVIEW
    const review = document.getElementById("answerReview");

    review.innerHTML = "";

    quizQuestions.forEach((question, index) => {

        const selectedAnswer = userAnswers[index];

        const isCorrect = selectedAnswer === question.answer;

        const item = document.createElement("article");

        item.className =
            `review-item ${isCorrect ? "correct-item" : "wrong-item"}`;

        const questionHeading = document.createElement("h3");

        questionHeading.textContent =
            `Question ${index + 1}: ${question.question}`;

        const yourAnswer = document.createElement("p");

        yourAnswer.textContent =
            `Your answer: ${selectedAnswer ?? "Not answered"}`;

        yourAnswer.className =
            isCorrect ? "review-correct" : "review-incorrect";

        const correctAnswer = document.createElement("p");

        correctAnswer.textContent =
            `Correct answer: ${question.answer}`;

        correctAnswer.className = "correct-answer";

        const status = document.createElement("span");

        status.className =
            `review-status ${isCorrect ? "review-correct" : "review-incorrect"}`;

        status.textContent = isCorrect
            ? "✓ Correct"
            : "✗ Incorrect — review this answer";

        const explanation = document.createElement("p");

        explanation.textContent =
            `Explanation: ${question.explanation || "No explanation provided."}`;

        explanation.className = "review-explanation";

        item.append(
            questionHeading,
            yourAnswer,
            correctAnswer,
            status,
            explanation
        );

        review.appendChild(item);
    });

    document.getElementById("resultCard").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// RESTART QUIZ / CREATE NEW QUIZ
function restartQuiz() {

    currentQuestion = 0;
    userAnswers = [];
    quizQuestions = [];
    score = 0;

    // Hide quiz and result sections
    document.getElementById("resultCard").style.display = "none";
    document.getElementById("quizCard").style.display = "block";
    document.getElementById("progressContainer").style.display = "block";
    document.getElementById("quizHeader").style.display = "flex";

    // Clear previous inputs
    document.getElementById("contentInput").value = "";

    const fileInput = document.getElementById("fileInput");

    if (fileInput) {
        fileInput.value = "";
    }

    document.getElementById("answerReview").innerHTML = "";

    document.getElementById("questionCount").value = "10";

    document.getElementById("errorMessage").style.display = "none";

    // Return to home screen
    showHome();
}
