pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract BuildAIAIJudgeFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Submission {
        address submitter;
        euint32 encryptedScore;
        uint256 submissionTime;
    }
    mapping(uint256 => Submission[]) public batchSubmissions;
    mapping(uint256 => bool) public batchClosed;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event SubmissionAdded(uint256 indexed batchId, address indexed submitter);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256[] scores);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchClosedOrDoesNotExist();
    error BatchNotClosed();
    error ReplayDetected();
    error StateMismatch();
    error InvalidBatchId();
    error EmptyBatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier respectCooldown(address _address, uint256 _lastTime, string memory _action) {
        if (block.timestamp < _lastTime + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60;
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addProvider(address provider) public onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) public onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) public onlyOwner {
        if (_paused != paused) {
            paused = _paused;
            if (paused) {
                emit Paused(msg.sender);
            } else {
                emit Unpaused(msg.sender);
            }
        }
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) public onlyOwner {
        emit CooldownSecondsSet(cooldownSeconds, _cooldownSeconds);
        cooldownSeconds = _cooldownSeconds;
    }

    function openBatch(uint256 batchId) public onlyOwner whenNotPaused {
        if (batchId == 0) revert InvalidBatchId();
        if (batchClosed[batchId]) revert BatchClosedOrDoesNotExist(); // Or if it's already open, depending on desired logic
        delete batchSubmissions[batchId]; // Clear any previous submissions if batchId is reused
        batchClosed[batchId] = false;
        emit BatchOpened(batchId);
    }

    function closeBatch(uint256 batchId) public onlyOwner whenNotPaused {
        if (batchId == 0) revert InvalidBatchId();
        if (batchClosed[batchId]) revert BatchClosedOrDoesNotExist();
        batchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function submitEncryptedScore(uint256 batchId, euint32 encryptedScore) public onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime[msg.sender], "submission") {
        if (batchId == 0) revert InvalidBatchId();
        if (!batchClosed[batchId]) revert BatchClosedOrDoesNotExist(); // Batch must be closed for submissions

        _initIfNeeded(encryptedScore);

        batchSubmissions[batchId].push(Submission({
            submitter: msg.sender,
            encryptedScore: encryptedScore,
            submissionTime: block.timestamp
        }));
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit SubmissionAdded(batchId, msg.sender);
    }

    function requestBatchDecryption(uint256 batchId) public onlyOwner whenNotPaused respectCooldown(address(this), lastDecryptionRequestTime[address(this)], "decryption request") {
        if (batchId == 0) revert InvalidBatchId();
        if (!batchClosed[batchId]) revert BatchNotClosed();
        if (batchSubmissions[batchId].length == 0) revert EmptyBatch();

        bytes32[] memory cts = _prepareBatchCiphertexts(batchId);
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[address(this)] = block.timestamp;
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();
        // Security: Replay protection ensures this callback is processed only once for a given requestId.

        uint256 batchId = decryptionContexts[requestId].batchId;
        bytes32[] memory cts = _prepareBatchCiphertexts(batchId);
        bytes32 currentHash = _hashCiphertexts(cts);
        // Security: State verification ensures that the contract state (specifically, the ciphertexts
        // that were supposed to be decrypted) has not changed since the decryption was requested.
        // This prevents scenarios where an attacker might alter the data after a request but before decryption.
        if (currentHash != decryptionContexts[requestId].stateHash) revert StateMismatch();

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 numScores = cleartexts.length / 32;
        uint256[] memory scores = new uint256[](numScores);
        for (uint i = 0; i < numScores; i++) {
            scores[i] = uint256(uint32(bytes4(cleartexts[i*32:i*32+4])));
        }

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, scores);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 value) internal {
        if (!value.isInitialized()) {
            value.initialize();
        }
    }

    function _requireInitialized(euint32 value) internal view {
        if (!value.isInitialized()) {
            revert("FHE value not initialized");
        }
    }

    function _prepareBatchCiphertexts(uint256 batchId) internal view returns (bytes32[] memory) {
        Submission[] storage submissions = batchSubmissions[batchId];
        uint256 numSubmissions = submissions.length;
        bytes32[] memory cts = new bytes32[](numSubmissions);
        for (uint i = 0; i < numSubmissions; i++) {
            cts[i] = submissions[i].encryptedScore.toBytes32();
        }
        return cts;
    }
}