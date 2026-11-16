# Strict JSON scalar extraction for read-only RPC persistence checks. No eval.
# LC_ALL=C is required so Unicode escapes can be decoded to UTF-8 bytes.
function bad() { failed=1; exit 2 }
function ws() { while (substr(src,pos,1) ~ /[ \t\r\n]/ && pos<=length(src)) pos++ }
function hex4(   h,n,j,d) {
 h=substr(src,pos,4); if(length(h)!=4 || h ~ /[^0-9a-fA-F]/) bad()
 n=0; for(j=1;j<=4;j++){d=index("0123456789abcdef",tolower(substr(h,j,1)))-1;n=n*16+d}
 pos+=4;return n
}
function utf8(n) {
 if(n<128)return sprintf("%c",n)
 if(n<2048)return sprintf("%c%c",192+int(n/64),128+n%64)
 if(n<65536)return sprintf("%c%c%c",224+int(n/4096),128+int(n/64)%64,128+n%64)
 return sprintf("%c%c%c%c",240+int(n/262144),128+int(n/4096)%64,128+int(n/64)%64,128+n%64)
}
function string(   out,c,e,n,low) {
 if(substr(src,pos++,1)!="\"")bad()
 out=""
 while(pos<=length(src)) {
  c=substr(src,pos++,1)
  if(c=="\"")return out
  if(c=="\\") {
   e=substr(src,pos++,1)
   if(e=="\"" || e=="\\" || e=="/")out=out e
   else if(e=="n")out=out "\n"
   else if(e=="r")out=out "\r"
   else if(e=="t")out=out "\t"
   else if(e=="b")out=out sprintf("%c",8)
   else if(e=="f")out=out sprintf("%c",12)
   else if(e=="u") {
    n=hex4()
    if(n>=55296 && n<=56319) {
     if(substr(src,pos,2)!="\\u")bad();pos+=2;low=hex4()
     if(low<56320 || low>57343)bad();n=65536+(n-55296)*1024+low-56320
    } else if(n>=56320 && n<=57343)bad()
    if(n==0)bad();out=out utf8(n)
   } else bad()
  } else { if(c ~ /[[:cntrl:]]/)bad();out=out c }
 }
 bad()
}
function emit(path,v,type) {
 if(path=="/result") {if(type!="string" || v!="success")bad();result_seen=1}
 if(kind=="session" && path ~ /^\/arguments\/(config-dir|download-dir|incomplete-dir|incomplete-dir-enabled)$/ || kind=="torrents" && path ~ /^\/arguments\/torrents\/[0-9]+\/downloadDir$/) {
  if(v ~ /[[:cntrl:]]/)bad()
  if(path ~ /incomplete-dir-enabled$/) {if(type!="boolean")bad()}
  else if(type!="string" || substr(v,1,1)!="/")bad()
  print path "\t" v
 }
}
function value(path,depth,   c,k,v,j,token) {
 if(depth>80)bad();ws();c=substr(src,pos,1)
 if(c=="{") {
  pos++;ws();if(substr(src,pos,1)=="}"){pos++;return}
  while(1) {
   ws();k=string();if(seen[path SUBSEP k]++)bad();ws()
   if(substr(src,pos++,1)!=":")bad()
   value(path "/" k,depth+1);ws();c=substr(src,pos++,1)
   if(c=="}")return;if(c!=",")bad()
  }
 } else if(c=="[") {
  pos++;ws();if(substr(src,pos,1)=="]"){pos++;return}
  j=0;while(1){value(path "/" j++,depth+1);ws();c=substr(src,pos++,1);if(c=="]")return;if(c!=",")bad()}
 } else if(c=="\""){v=string();emit(path,v,"string")}
 else {
  token=substr(src,pos)
  if(match(token,/^(true|false|null)/)){v=substr(token,1,RLENGTH);pos+=RLENGTH;emit(path,v,v=="null"?"null":"boolean")}
  else if(match(token,/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/)){v=substr(token,1,RLENGTH);pos+=RLENGTH;emit(path,v,"number")}
  else bad()
 }
}
{ src=src $0 "\n" }
END { if(failed)exit 2;pos=1;value("",0);ws();if(pos<=length(src) || !result_seen)exit 2 }
