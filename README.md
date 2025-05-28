# AI Proof Buddy

AI Proof Buddy is a web application designed to help humans in evaluating the output of AI systems, particularly large language models (LLMs) and agentic frameworks. It provides a simple interface where users upload AI result in JSON format, review, correct, and validate AI-generated content—ensuring higher accuracy and reliability of AI outputs.

![image](https://github.com/user-attachments/assets/b8b026bc-4b50-4518-a311-5cfdd91d3c9f)
![image](https://github.com/user-attachments/assets/61679a12-d01f-4164-a765-09a04431f4ee)
![image](https://github.com/user-attachments/assets/45bdc224-5cd9-4fdf-b6a9-43e9ec666387)



## Features

- **Directory Upload**: Upload entire directories of JSON files while preserving the folder structure
- **File Management**: Browse, download, evaluate, and delete files in a tree view
- **Evaluation Interface**: Evaluate JSON data with a user-friendly interface
  - Approve or reject entities
  - Add remarks and corrections
  - Save evaluations alongside original files
- **Bulk Export**: Export evaluations. 

## Getting Started
- Step 1: Upload or paste AI-generated content/output. Note: The uploaded content must be in JSON format and organized within a directory.
- Step 2: Go to the Uploaded Files, review the content and provide feedback (thumbs up/down, corrections).
- Step 3: Save and export the evaluated results.
### Prerequisites

- Node.js 18.x or later
- npm 9.x or later

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd aiproofbuddy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Installation via Docker
1. Clone the repository:
   ```bash
   git clone https://github.com/sensein/aiproofbuddy.git
   cd aiproofbuddy
   ```
2. Run Docker Compose. Note you must have Docker installed in your system.
   ```bash
   docker compose up
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.
   
## Usage

- [https://www.youtube.com/watch?v=UAv-9UI49to](https://www.youtube.com/watch?v=UAv-9UI49to)
