# Portfolio Tracker - Deployment Guide

This guide will help you install Docker on **Ubuntu 20.04** and run the `portfoliotracker` Docker container headlessly.

---

## 🚀 Quick Docker Installation (Ubuntu 20.04)

Run this **one-liner** to install Docker via the CLI:

> (Press ENTER if it prompts you to)

```bash
sudo apt update && sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add - && sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable" && sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io && sudo systemctl enable docker && sudo systemctl start docker && sudo docker --version
```

## 🛠️ Building and Running from Source

Since this project requires building the Docker image locally, follow the steps below.

### Step 1 – Build the Docker Image

In the project directory (where your `Dockerfile` is located), run:

```bash
docker build -t portfoliotracker .
```
### Step 2 – Run the Docker Container

After building the image, run the container in **detached mode** (so it runs in the background without needing an active shell):

```bash
docker run -d --name portfolio-app --restart unless-stopped -p 4173:4173 portfoliotracker
```
## 🎯 Access the App
Once the container is running, you can access the app in your browser at:
```bash
http://[YOUR_SERVER_IP]:4173
```

## 🔍 Useful Docker Commands

Here are some common Docker commands to help you manage your container.

### 📋 Check Running Containers
```bash
docker ps
```
## 📂 View Container Logs
```bash
docker logs -f portfolio-app
```
## 🛑 Stop the Container
```bash
docker stop portfolio-app
```
## ▶️ Start the Container
```bash
docker start portfolio-app
```
## 🗑️ Remove the Container
```bash
docker rm portfolio-app
```
