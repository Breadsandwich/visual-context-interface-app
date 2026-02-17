FROM node:20-alpine

# Add Python for the FastAPI backend
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 3001 8002

CMD ["./entrypoint.sh"]
