FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src/ ./src/
RUN mvn -q package -DskipTests

# Pre-build the GraphHopper graph cache during the Docker build.
# At runtime, importOrLoad() finds the pre-built cache and loads it in ~3 s
# instead of re-importing the OSM file from scratch every cold start (~35 s).
COPY fast_routing_map.osm.pbf ./
RUN java -Xmx700m -cp target/fast-routing-1.0-SNAPSHOT.jar util.GraphCacheBuilder fast_routing_map.osm.pbf graph-cache-v2

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /build/target/fast-routing-1.0-SNAPSHOT.jar ./
COPY --from=build /build/graph-cache-v2/ ./graph-cache-v2/
COPY fast_routing_map.osm.pbf ./
ENV PORT=8082
EXPOSE 8082
CMD ["java", "-Xmx400m", "-jar", "fast-routing-1.0-SNAPSHOT.jar"]
