-- 법령 이름 색인(FTS5). `CONVENTIONS.md` §6("측정 없이 최적화하지 않는다")
--
-- **왜.** 법령 검색이 `name LIKE '%질의%'`였다. LIKE의 앞머리 와일드카드는 인덱스를 쓸 수
-- 없어서 168,494행을 매번 훑는다. 실측(2026-09-04, 개발 기계):
--
--   법령 LIKE 검색(없는 낱말)  25.46ms   ← 전체 스캔
--   법령 LIKE 검색("도로교통")  4.44ms   ← 앞쪽에서 걸려 LIMIT로 끊김
--   판례 FTS 검색               0.01ms
--
-- 검색 화면 응답의 대부분이 이 한 번의 스캔이었고, 초성 후보가 여럿이면 그만큼 곱해진다.
--
-- **이름만 넣는다.** 조문 본문(`law_article`)은 색인하지 않는다 — 195행뿐이라 지금은 필요가
-- 없고, 본문 검색을 하려면 무엇을 어떻게 보여 줄지부터 정해야 한다.
--
-- 되돌리려면: DROP TRIGGER 셋과 DROP TABLE law_fts.

-- **트라이그램 토크나이저를 쓴다.** 기본(`unicode61`)은 띄어쓰기로만 잘라서 낱말 **중간**을
-- 찾지 못한다. 실제로 "유동화"로 「자산유동화에 관한 법률」을 못 찾았다(LIKE는 찾던 것이다).
-- 한국어 법령 이름은 붙여 쓴 복합어라 이 차이가 곧 검색 실패가 된다.
--
-- 트라이그램은 세 글자씩 잘라 색인하므로 **두 글자 이하 질의는 걸리지 않는다.** 그 경우에는
-- 부르는 쪽이 예전처럼 LIKE로 훑는다(`repository.ts`의 `searchLawVersions`).
CREATE VIRTUAL TABLE `law_fts` USING fts5(
  law_id UNINDEXED,
  name,
  tokenize = 'trigram'
);
--> statement-breakpoint

-- 법 하나에 판이 수십 개다(도로교통법 132판). 색인은 **법 단위**로 한 줄만 둔다 —
-- 판마다 넣으면 색인이 168,494행이 되고, 검색 결과에서 같은 법이 132번 나온다.
INSERT INTO `law_fts` (law_id, name)
SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
FROM `law_version`
GROUP BY law_id;
--> statement-breakpoint

-- 새 판이 들어올 때 그 법이 색인에 없으면 넣는다. 이름이 바뀌는 개정도 이 자리로 들어온다.
CREATE TRIGGER `law_fts_insert` AFTER INSERT ON `law_version`
BEGIN
  DELETE FROM `law_fts` WHERE law_id = new.law_id;
  INSERT INTO `law_fts` (law_id, name)
  SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
  FROM `law_version` WHERE law_id = new.law_id GROUP BY law_id;
END;
--> statement-breakpoint

CREATE TRIGGER `law_fts_update` AFTER UPDATE OF name, short_name ON `law_version`
BEGIN
  DELETE FROM `law_fts` WHERE law_id = new.law_id;
  INSERT INTO `law_fts` (law_id, name)
  SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
  FROM `law_version` WHERE law_id = new.law_id GROUP BY law_id;
END;
--> statement-breakpoint

-- 판을 지웠는데 그 법의 마지막 판이었으면 색인에서도 뺀다.
CREATE TRIGGER `law_fts_delete` AFTER DELETE ON `law_version`
WHEN NOT EXISTS (SELECT 1 FROM `law_version` WHERE law_id = old.law_id)
BEGIN
  DELETE FROM `law_fts` WHERE law_id = old.law_id;
END;
