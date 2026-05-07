-- Photo Gallery Database Schema
-- Run this on your Google Cloud SQL (MySQL) instance

CREATE DATABASE IF NOT EXISTS photo_gallery
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE photo_gallery;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  email       VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  tags          VARCHAR(500),
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     INT          NOT NULL,
  gcs_url       VARCHAR(1000) NOT NULL,
  gcs_path      VARCHAR(500)  NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table (managed by express-mysql-session automatically)
-- but you can pre-create it:
CREATE TABLE IF NOT EXISTS sessions (
  session_id  VARCHAR(128) NOT NULL PRIMARY KEY,
  expires     INT(11)      UNSIGNED NOT NULL,
  data        MEDIUMTEXT,
  INDEX (expires)
);

-- Index for search performance
CREATE INDEX idx_photos_user_id  ON photos (user_id);
CREATE INDEX idx_photos_title    ON photos (title);
CREATE INDEX idx_photos_tags     ON photos (tags);
CREATE FULLTEXT INDEX ft_photos_search ON photos (title, description, tags);
--project-da6702aa-6a67-4d39-81f:us-central1:photo-gallery-db