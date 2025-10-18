# Build AI Judge FHE: A Creative Building Game Enhanced by AI Judging 🤖🏗️

Build AI Judge FHE is an innovative building game that leverages **Zama's Fully Homomorphic Encryption technology** to create a unique and secure environment for players. Drawing inspiration from classic sandbox games, this platform allows players to construct and submit their creations for anonymous evaluation by a trained AI aesthetics model. This ensures a fair and unbiased judging process, empowering creativity and innovation in a competitive yet safe space.

## The Creative Challenge

In the realm of creative games, fairness and impartiality in judging can often be a challenge. Traditional methods of evaluation can lead to biases and favoritism, undermining the integrity of competitions. Players may second-guess the fairness of the judging process, which can dampen their enthusiasm and creativity. 

## How Zama's FHE Technology Solves This Problem

By utilizing Zama's Fully Homomorphic Encryption, Build AI Judge FHE provides a solution to the inherent biases in construction competitions. The players' submitted works are encrypted using FHE, allowing the AI model to evaluate them without ever needing to reveal the original creations. This revolutionary approach guarantees absolute fairness, as the judging process is entirely devoid of personal biases and is conducted anonymously. Implemented through Zama's open-source libraries such as **Concrete** and the **zama-fhe SDK**, this game redefines the standards of creativity and competitiveness in the gaming world.

## Core Features

- **FHE Encrypted Submissions**: Players' works are securely encrypted, ensuring their original designs remain confidential until the results are revealed.
- **AI Aesthetic Judging**: A robust AI model assesses the submissions, providing an objective evaluation based solely on aesthetics.
- **Fair Competition Environment**: The anonymity of submissions guarantees that all players have an equal chance, devoid of bias.
- **Creative Encouragement**: The platform fosters creativity by allowing players to express their ideas without fear of judgment based on personal relationships.

## Technology Stack

- **Zama FHE SDK**: Core technology enabling confidential computation.
- **Node.js**: Environment for running JavaScript code server-side.
- **Hardhat**: Smart contract development framework used in this project.
- **AI Models**: Machine learning models for aesthetic evaluation.

## Project Structure

Here’s a look at the directory structure of the Build AI Judge FHE project:

```
Build_AI_Judge_FHE/
│
├── contracts/
│   └── Build_AI_Judge_FHE.sol
│
├── src/
│   ├── index.js
│   ├── ai_model.py
│   └── utils.js
│
├── tests/
│   ├── test_contract.js
│   └── test_ai_model.py
│
├── package.json
└── README.md
```

## Installation Guide

To set up Build AI Judge FHE, follow these steps:

1. Ensure you have **Node.js** installed (version 14 or later).
2. Install **Hardhat** globally if you haven't already:

   ```bash
   npm install --global hardhat
   ```

3. Navigate to the project directory in your terminal (where the `README.md` file lives).
4. Run the following command to install the necessary dependencies:

   ```bash
   npm install
   ```

This command will fetch the required Zama FHE libraries along with other dependencies needed for the project.

## Build & Run Guide

Once the installation is complete, you can compile, test, and run your project with the following commands:

1. **Compile Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Deploy Contracts**:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

### Example Usage

Here’s a simple example of how you might encrypt and submit a player's building creation:

```javascript
const { encryptCreation } = require('./utils');
const playerCreation = {
    structure: 'A pixelated castle made of colorful blocks.',
    playerId: 'player123'
};

const encryptedCreation = encryptCreation(playerCreation);
console.log(encryptedCreation); // This output will be the encrypted version of the player's creation.
```

This snippet highlights how to securely encrypt a player's creation, maintaining confidentiality until it reaches the AI for evaluation.

## Acknowledgements

### Powered by Zama

We extend our heartfelt thanks to the Zama team for their pioneering work in Fully Homomorphic Encryption technology and their open-source tools. Their efforts have made it possible to build a new frontier in secure, confidential blockchain applications and ensure that creativity thrives without boundaries. 🌟
