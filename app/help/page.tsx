'use client';
import Image from 'next/image';
import {red} from "next/dist/lib/picocolors";

export default function Help() {
    return (
        <div className="container mt-4">
            <div className="card">
                <div className="card-header">
                    <h2 className="mb-0">Help & Documentation</h2>
                </div>
                <div className="card-body">
                    <h4>What is AI Proof Buddy?</h4>
                    <p>
                        <strong>AI Proof Buddy</strong> is a web application designed to help humans in evaluating the
                        output of AI
                        systems, particularly large language models (LLMs) and agentic frameworks. It provides a simple
                        interface
                        where users upload AI result in JSON format, review, correct, and validate AI-generated
                        content—ensuring
                        higher accuracy and reliability of AI outputs.
                    </p>

                    <h4>Why is it called AI Proof Buddy?</h4>
                    <p>
                        The name <strong>AI Proof Buddy</strong> captures the core idea of the application. Just as
                        proofreading
                        involves reviewing and correcting errors in written content, AI Proof Buddy enables humans to
                        serve as
                        a <i>"buddy"</i> to AI—collaboratively evaluating its outputs to ensure accuracy and quality. By
                        reviewing
                        AI-generated results, identifying errors, and validating correctness, users play a critical role
                        in
                        enhancing the reliability of AI systems.
                    </p>
                    <hr/>

                    <h4>Getting Started</h4>
                    <ul>
                        <li>Step 1: Upload or paste AI-generated content/output. <span style={{color: 'red'}}>Note: The uploaded content must be in JSON format and organized within a directory.</span>
                        </li>
                        <li>Step 2: Go to the <i>Uploaded Files</i>, review the content and provide feedback (thumbs
                            up/down,
                            corrections).
                        </li>
                        <li>Step 3: Save and export the evaluated results.</li>
                    </ul>
                    <hr/>
                    <h4>Frequently Asked Questions</h4>
                    <ul>
                        <li><strong>Q: What types of AI outputs can I evaluate? </strong> <br/> <strong>A:</strong> You
                            can evaluate
                            outputs from any large language model (LLM) or AI system that produces text-based
                            results. <span
                                style={{color: 'red'}}>Important!: The uploaded content must be in JSON format and organized within a directory.</span>
                        </li>
                        <li><strong>Q: How do I provide feedback on AI outputs? </strong><br/> <strong>A:</strong> Use
                            the thumbs
                            up/down buttons and make corrections directly in the interface. <br/>
                            <i>If your data includes start and end positions, such as entity positions within a
                                sentence, clicking the
                                thumbs-up button will adjust the positions if they are not exact and mark them as
                                approved (see image below). This is the
                                intended behavior.</i>
                            <br/>
                            <Image
                                src="/correct_entity_thumbsup.png"
                                alt="Correcting entity with thumbs up"
                                width={1200}
                                height={600}
                                className="img-fluid rounded"
                            />
                        </li>
                        <li><strong>Q: If I upload my data, will it be saved? </strong><br/> <strong>A:</strong>
                            Yes, when you upload your data, it is <span
                                style={{fontWeight: 'bold', color: 'red'}}>temporarily stored</span> on our server to
                            enable the
                            evaluation process. However, we do <span
                                style={{fontWeight: 'bold', color: 'red'}}>not</span> have an
                            automated mechanism to delete your data after evaluation. <br/>
                            Therefore, we strongly recommend that you <span
                                style={{fontWeight: 'bold', color: 'green'}}>export your data</span> once
                            you have completed your evaluation and <span style={{fontWeight: 'bold', color: 'green'}}>manually delete it</span> from
                            the system. <br/>
                            <span style={{fontWeight: 'bold', color: 'red'}}>Important:</span> The uploaded data is
                            considered <span
                                style={{fontWeight: 'bold', color: 'red'}}>public</span> and is <span
                                style={{fontWeight: 'bold', color: 'red'}}>not</span> protected by any privacy or
                            confidentiality
                            guarantees.
                        </li>

                        <li>
                            <strong>Q: I don't want to upload the data. Can I use this tool locally? </strong><br/>
                            <strong>A:</strong> Yes, you can use this tool locally. Simply <span
                            style={{fontWeight: 'bold', color: 'green'}}>clone the code</span> from our GitHub
                            repository: <span
                            style={{fontWeight: 'bold', color: 'blue'}}><a
                            href="https://github.com/sensein/aiproofbuddy" target="_blank"
                            rel="noopener noreferrer">https://github.com/sensein/aiproofbuddy</a></span> and <span
                            style={{fontWeight: 'bold', color: 'green'}}>build it using Docker Compose</span>. The
                            detailed
                            instructions are available in <span style={{fontWeight: 'bold', color: 'blue'}}><a
                            href="https://github.com/sensein/aiproofbuddy" target="_blank">GitHub</a></span>.

                        </li>
                        <li>
                            <strong>Q: Why can't I upload a JSON file directly? Why does it need to be inside a
                                folder? </strong> <br/>
                            <strong>A:</strong> AI Proof Buddy is designed to organize content by directory. We support
                            multiple directories and files to help group related content together. To maintain this
                            structure, each file must be placed inside a directory when uploading.


                        </li>

                    </ul>
                    <hr/>

                    <h4>Demo</h4>
                    <p>This video shows how you can use <strong>AI Proof Buddy</strong> to upload AI-generated JSON
                        data, review, approve or correct results, and export the final validated output. Watch
                        this demo to get a quick overview of the tool in action.</p>
                    <br/>
                    <div className="ratio ratio-16x9 mb-4">
                        <iframe
                            width="560"
                            height="315"
                            src="https://www.youtube.com/embed/KKARQ46GmFc"
                            title="AI Proof Buddy Demo"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                    <hr/>

                    <h4>Contact Support</h4>
                    <p>
                        If you have questions or need assistance, please contact our support team at <a
                        href="mailto:tekraj@mit.edu">tekraj@mit.edu</a>.
                    </p>
                    <h4>Copyright</h4>
                    <p>
                        AI Proof Buddy is part of the <span style={{fontWeight: 'bold', color: 'blue'}}><a
                        href="https://beta.brainkb.org/" target="_blank"
                        rel="noopener noreferrer">BrainKB</a></span> project. <br/>
                        &copy; {new Date().getFullYear()} BrainKB. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
