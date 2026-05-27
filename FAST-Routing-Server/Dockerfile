FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src/ ./src/
RUN mvn -q package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /build/target/fast-routing-1.0-SNAPSHOT.jar ./
COPY export.osm ./
ENV PORT=8082
EXPOSE 8082
CMD ["java", "-Xmx400m", "-jar", "fast-routing-1.0-SNAPSHOT.jar"]
