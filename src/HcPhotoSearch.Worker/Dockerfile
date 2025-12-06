# Build Stage
# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj and restore as distinct layers
# Copy csproj and restore as distinct layers
COPY ["HcPhotoSearch.Worker/HcPhotoSearch.Worker.csproj", "HcPhotoSearch.Worker/"]
COPY ["HcPhotoSearch.Shared/HcPhotoSearch.Shared.csproj", "HcPhotoSearch.Shared/"]
RUN dotnet restore "HcPhotoSearch.Worker/HcPhotoSearch.Worker.csproj"

# Copy everything else and build
COPY . .
RUN dotnet publish "HcPhotoSearch.Worker/HcPhotoSearch.Worker.csproj" -c Release -o /app/publish

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "HcPhotoSearch.Worker.dll"]
