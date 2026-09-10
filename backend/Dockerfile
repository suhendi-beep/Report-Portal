FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl wget gnupg unzip sudo tzdata \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libxshmfence1 libx11-6 libx11-xcb1 libxcb1 libxext6 \
    fonts-liberation xdg-utils chromium chromium-driver \
    && ln -fs /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata \
    && rm -rf /var/lib/apt/lists/*

# All log timestamps (datetime.now()) and Celery Beat schedules use this.
ENV TZ="Asia/Jakarta"

RUN curl -fsSL \
    https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh \
    | bash -s -- --accept-all-defaults
ENV PATH="/root/bin:${PATH}"
ENV PYTHONPATH="/app"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/shared/reports /app/shared/screenshots /app/shared/logs /app/shared/cookies

EXPOSE 5000
CMD ["python", "app.py"]
