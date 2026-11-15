FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git build-essential cmake pkg-config libcurl4-openssl-dev libssl-dev libevent-dev libminiupnpc-dev libnatpmp-dev zlib1g-dev python3 autoconf automake libtool gettext && rm -rf /var/lib/apt/lists/*
ARG SOURCE_COMMIT
RUN test -n "$SOURCE_COMMIT" && git init /source && cd /source && git remote add origin https://github.com/transmission/transmission.git && git fetch --depth 1 origin "$SOURCE_COMMIT" && git checkout --detach FETCH_HEAD && git submodule update --init --recursive --depth 1 --jobs 4
RUN cmake -S /source -B /build -DCMAKE_BUILD_TYPE=Release -DENABLE_GTK=OFF -DENABLE_QT=OFF -DENABLE_MAC=OFF -DENABLE_TESTS=OFF -DENABLE_CLI=OFF -DENABLE_WEB=OFF -DCMAKE_INSTALL_PREFIX=/usr/local && cmake --build /build --parallel 6 && cmake --install /build
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libcurl4 libssl3 libevent-2.1-7 libminiupnpc17 libnatpmp1 python3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local /usr/local
COPY lab/entrypoint.py /entrypoint.py
ENV TRANSMISSION_WEB_HOME=/webui
ENTRYPOINT ["python3", "/entrypoint.py"]
