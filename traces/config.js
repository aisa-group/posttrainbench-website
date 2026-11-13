// Where the viewer's data lives: PostTrainBench's runs, on Hugging Face.
window.PTB_DATA_BASE = "https://huggingface.co/datasets/aisa-group/PostTrainBench-Trajectories/resolve/main/viewer_data/";
window.PTB_RAW_BASE  = "https://huggingface.co/datasets/aisa-group/PostTrainBench-Trajectories/tree/main/";

// Other suites, picked with ?suite=<name> (assets/suite.js). Their settings replace
// the ones above: { label, home, config: { PTB_DATA_BASE, ... } }.
window.PTB_SUITES = {};
