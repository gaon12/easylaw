-- 코퍼스 전문 검색(FTS5). `PRODUCT.md` §5.2 · `CONVENTIONS.md` §10.2
--
-- **왜 필요한가.** 지금까지 내용으로 판례를 찾는 일은 전부 법제처 API가 했다. 그래서
-- 법제처 키가 없으면 "내용으로 찾기"가 통째로 꺼지고, 이미 우리 DB에 받아 둔 판결문조차
-- 제목으로도 찾을 수 없었다.
--
-- **왜 손으로 쓰나.** FTS5 가상 테이블은 drizzle 스키마로 표현되지 않는다. 그래서
-- `drizzle-kit generate --custom`으로 빈 파일을 받아 여기에 직접 적는다(§10.2가 허용하는
-- 예외이고, 쿼리 쪽은 `sql` 태그드 템플릿으로 값을 바인딩한다).
--
-- **한국어 토큰화의 한계.** 기본 `unicode61` 토크나이저는 띄어쓰기와 문장부호로만 자른다.
-- 그래서 "도로교통법"으로는 찾아도 "교통법"으로는 못 찾는다(형태소 분석기가 아니다).
-- 접두사 검색(`"도로"*`)까지가 우리가 줄 수 있는 것이고, 그 사실을 화면에 적는다.
--
-- 되돌리려면: DROP TRIGGER 다섯 개와 DROP TABLE judgment_fts.

CREATE VIRTUAL TABLE `judgment_fts` USING fts5(
  judgment_id UNINDEXED,
  kind UNINDEXED,
  text,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint

-- 이미 들어와 있는 판결문을 넣는다. 마이그레이션 시점의 코퍼스가 검색에서 빠지면
-- "받아 둔 것도 못 찾는" 지금 상태가 그대로 남는다.
INSERT INTO `judgment_fts` (judgment_id, kind, text)
SELECT id, 'name', case_name FROM `judgment` WHERE case_name IS NOT NULL;
--> statement-breakpoint

INSERT INTO `judgment_fts` (judgment_id, kind, text)
SELECT judgment_id, 'span', text FROM `judgment_span`;
--> statement-breakpoint

-- 사건명은 판결문 행이 만들어질 때와 바뀔 때 따라간다.
CREATE TRIGGER `judgment_fts_insert` AFTER INSERT ON `judgment`
WHEN new.case_name IS NOT NULL
BEGIN
  INSERT INTO `judgment_fts` (judgment_id, kind, text) VALUES (new.id, 'name', new.case_name);
END;
--> statement-breakpoint

CREATE TRIGGER `judgment_fts_update` AFTER UPDATE OF case_name ON `judgment`
BEGIN
  DELETE FROM `judgment_fts` WHERE judgment_id = new.id AND kind = 'name';
  INSERT INTO `judgment_fts` (judgment_id, kind, text)
  SELECT new.id, 'name', new.case_name WHERE new.case_name IS NOT NULL;
END;
--> statement-breakpoint

-- 판결문이 지워지면 그 문서의 색인도 전부 지운다. 외래 키가 가상 테이블에는 걸리지 않는다.
CREATE TRIGGER `judgment_fts_delete` AFTER DELETE ON `judgment`
BEGIN
  DELETE FROM `judgment_fts` WHERE judgment_id = old.id;
END;
--> statement-breakpoint

-- 원문 문장. 본문을 다시 받아 오면 span이 지워지고 다시 들어오므로 두 트리거로 충분하다.
CREATE TRIGGER `judgment_span_fts_insert` AFTER INSERT ON `judgment_span`
BEGIN
  INSERT INTO `judgment_fts` (judgment_id, kind, text) VALUES (new.judgment_id, 'span', new.text);
END;
--> statement-breakpoint

CREATE TRIGGER `judgment_span_fts_delete` AFTER DELETE ON `judgment_span`
BEGIN
  DELETE FROM `judgment_fts` WHERE judgment_id = old.judgment_id AND kind = 'span' AND text = old.text;
END;
