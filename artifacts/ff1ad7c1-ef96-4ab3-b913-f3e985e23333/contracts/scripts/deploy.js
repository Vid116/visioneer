const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  const TileNFT = await hre.ethers.getContractFactory("TileNFT");

  // Constructor params: name, symbol, baseURI, initialOwner
  const tileNFT = await TileNFT.deploy(
    "LED Board Tiles",
    "TILE",
    "https://your-metadata-url.com/tiles/",
    deployer.address
  );

  await tileNFT.waitForDeployment();
  const address = await tileNFT.getAddress();

  console.log("TileNFT deployed to:", address);
  console.log("All 64 tiles minted to:", deployer.address);

  // Save deployment info
  fs.writeFileSync("deployment.json", JSON.stringify({
    network: hre.network.name,
    contract: address,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
